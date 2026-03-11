import { supabase } from '../supabase'
import {
    Contact,
    ContactStatus
} from '../../types'
import { normalizePhoneNumber, validatePhoneNumber } from '../phone-formatter'

interface ContactRow {
    id: string
    name: string
    phone: string
    email: string | null
    status: string
    tags: unknown
    custom_fields: Record<string, unknown> | null
    created_at: string
    updated_at: string | null
}

// Helpers
import { nanoid } from 'nanoid'
const generateId = () => {
    try {
        if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
    } catch { }
    return nanoid()
}

const flattenTags = (tags: any): string[] => {
    if (!tags) return []
    if (typeof tags === 'string') {
        try {
            const parsed = JSON.parse(tags)
            return Array.isArray(parsed) ? flattenTags(parsed) : [tags]
        } catch {
            return [tags]
        }
    }
    if (Array.isArray(tags)) {
        return Array.from(new Set(tags.flatMap(t => flattenTags(t))))
    }
    return [String(tags)]
}

function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size))
    }
    return chunks
}

const mapRowToContact = (row: ContactRow, suppression?: { reason: string | null; source: string | null; expiresAt: string | null } | null): Contact => {
    const isSuppressed = suppression !== null && suppression !== undefined
    const dbStatus = (row.status as ContactStatus) || ContactStatus.OPT_IN
    const effectiveStatus = isSuppressed ? ContactStatus.SUPPRESSED : dbStatus
    const contact: Contact = {
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email || undefined,
        status: effectiveStatus,
        originalStatus: dbStatus,
        tags: flattenTags(row.tags),
        lastActive: row.updated_at
            ? new Date(row.updated_at).toLocaleDateString()
            : (row.created_at ? new Date(row.created_at).toLocaleDateString() : '-'),
        createdAt: row.created_at,
        updatedAt: row.updated_at || undefined,
        custom_fields: row.custom_fields || {},
    }

    if (isSuppressed && suppression) {
        contact.suppressionReason = suppression.reason ?? null
        contact.suppressionSource = suppression.source ?? null
        contact.suppressionExpiresAt = suppression.expiresAt ?? null
    }

    return contact
}

export const contactDb = {
    getAll: async (): Promise<Contact[]> => {
        const PAGE_SIZE = 1000
        const allRows: ContactRow[] = []
        let from = 0

        while (true) {
            const to = from + PAGE_SIZE - 1
            const { data, error } = await supabase
                .from('contacts')
                .select('*')
                .order('id', { ascending: true })
                .range(from, to)

            if (error) throw error

            const rows = data || []
            allRows.push(...rows)

            if (rows.length < PAGE_SIZE) break

            from += PAGE_SIZE
        }

        return allRows.map(r => mapRowToContact(r))
    },

    list: async (params: {
        limit: number
        offset: number
        search?: string | null
        status?: string | null
        tag?: string | null
    }): Promise<{ data: Contact[]; total: number }> => {
        const limit = Math.max(1, Math.min(100, Math.floor(params.limit || 10)))
        const offset = Math.max(0, Math.floor(params.offset || 0))
        const search = (params.search || '').trim()
        const status = (params.status || '').trim()
        const tag = (params.tag || '').trim()

        const buildContactSearchOr = (raw: string) => {
            const term = String(raw || '').trim()
            const like = `%${term}%`
            const digits = term.replace(/\D/g, '')

            const parts = [
                `name.ilike.${like}`,
                `email.ilike.${like}`,
                `phone.ilike.${like}`,
            ]

            if (digits && digits !== term) {
                parts.push(`phone.ilike.%${digits}%`)
            }

            return Array.from(new Set(parts.map((p) => p.trim()).filter(Boolean))).join(',')
        }

        const normalizePhone = (phone: string) => {
            const p = String(phone || '').trim()
            return p.startsWith('+') ? p.slice(1) : p
        }

        let preSuppressedPhonesNormalized = new Set<string>()
        if (status === 'SUPPRESSED') {
            const { data: preSupRows, error: preSupError } = await supabase
                .from('phone_suppressions')
                .select('phone')
                .eq('is_active', true)
                .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
                .limit(5000)

            if (preSupError) throw preSupError

            if ((preSupRows?.length ?? 0) >= 5000) {
                console.warn('contactDb.list(): limite de 5000 supressões atingido — filtro SUPPRESSED pode estar incompleto')
            }

            for (const row of preSupRows || []) {
                const phone = String(row.phone || '').trim()
                if (phone) preSuppressedPhonesNormalized.add(normalizePhone(phone))
            }
        }

        let query = supabase
            .from('contacts')
            .select('*', { count: 'exact' })

        if (search) {
            query = query.or(buildContactSearchOr(search))
        }

        if (tag && tag !== 'ALL') {
            if (tag === 'NONE' || tag === '__NO_TAGS__') {
                query = query.or('tags.is.null,tags.eq.[]')
            } else {
                query = query.filter('tags', 'cs', JSON.stringify([tag]))
            }
        }

        if (status === 'SUPPRESSED') {
            if (preSuppressedPhonesNormalized.size === 0) {
                return { data: [], total: 0 }
            }
            const phoneVariations = Array.from(preSuppressedPhonesNormalized).flatMap(p => [p, '+' + p])
            query = query.in('phone', phoneVariations)
        } else if (status && status !== 'ALL') {
            query = query.eq('status', status)
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (error) throw error

        const phonesOnPage = (data as ContactRow[] || []).map(c => String(c.phone || '').trim()).filter(Boolean)

        const suppressionMap = new Map<string, { reason: string | null; source: string | null; expiresAt: string | null }>()

        if (phonesOnPage.length > 0) {
            const phoneVariants = new Set<string>()
            for (const phone of phonesOnPage) {
                const p = phone.trim()
                if (!p) continue
                phoneVariants.add(p)
                if (p.startsWith('+')) {
                    phoneVariants.add(p.slice(1))
                } else {
                    phoneVariants.add('+' + p)
                }
            }
            const phonesForSuppressionLookup = Array.from(phoneVariants)

            const { data: suppressionRows, error: suppressionError } = await supabase
                .from('phone_suppressions')
                .select('phone,is_active,expires_at,reason,source')
                .eq('is_active', true)
                .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
                .in('phone', phonesForSuppressionLookup)
                .limit(5000)

            if (suppressionError) throw suppressionError

            for (const row of suppressionRows || []) {
                const phone = String(row.phone || '').trim()
                if (phone) {
                    const normalized = normalizePhone(phone)
                    suppressionMap.set(normalized, {
                        reason: row.reason ?? null,
                        source: row.source ?? null,
                        expiresAt: row.expires_at ?? null,
                    })
                }
            }
        }

        return {
            data: ((data as unknown) as ContactRow[] || []).map(row => {
                const rowPhone = String(row.phone || '').trim()
                const normalizedRowPhone = normalizePhone(rowPhone)
                const suppression = suppressionMap.get(normalizedRowPhone) || null
                return mapRowToContact(row, suppression)
            }),
            total: count || 0,
        }
    },

    getIds: async (params: {
        search?: string | null
        status?: string | null
        tag?: string | null
    }): Promise<string[]> => {
        const search = (params.search || '').trim()
        const status = (params.status || '').trim()
        const tag = (params.tag || '').trim()

        const buildContactSearchOr = (raw: string) => {
            const term = String(raw || '').trim()
            const like = `%${term}%`
            const digits = term.replace(/\D/g, '')

            const parts = [
                `name.ilike.${like}`,
                `email.ilike.${like}`,
                `phone.ilike.${like}`,
            ]

            if (digits && digits !== term) {
                parts.push(`phone.ilike.%${digits}%`)
            }

            return Array.from(new Set(parts.map((p) => p.trim()).filter(Boolean))).join(',')
        }

        let suppressedPhones: string[] = []
        if (status === 'SUPPRESSED') {
            const { data: suppressionRows, error: suppressionError } = await supabase
                .from('phone_suppressions')
                .select('phone')
                .eq('is_active', true)
                .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())

            if (suppressionError) throw suppressionError

            suppressedPhones = suppressionRows
                ? suppressionRows.map((row) => String(row.phone || '').trim().replace(/^\+/, '')).filter(Boolean)
                : []

            if (!suppressedPhones.length) return []

            suppressedPhones = suppressedPhones.flatMap(p => [p, '+' + p])
        }

        const buildQuery = (from: number, to: number) => {
            let q = supabase.from('contacts').select('id').order('id', { ascending: true }).range(from, to)

            if (search) q = q.or(buildContactSearchOr(search))

            if (status && status !== 'ALL' && status !== 'SUPPRESSED') {
                q = q.eq('status', status)
            }

            if (tag && tag !== 'ALL') {
                if (tag === 'NONE' || tag === '__NO_TAGS__') {
                    q = q.or('tags.is.null,tags.eq.[]')
                } else {
                    q = q.filter('tags', 'cs', JSON.stringify([tag]))
                }
            }

            return q
        }

        if (status === 'SUPPRESSED' && suppressedPhones.length > 0) {
            const PHONE_CHUNK_SIZE = 100
            const phoneChunks = chunk(suppressedPhones, PHONE_CHUNK_SIZE)

            const allIds: string[] = []
            const seen = new Set<string>()

            const CONCURRENT_LIMIT = 5
            const chunkResults: string[][] = []
            for (let i = 0; i < phoneChunks.length; i += CONCURRENT_LIMIT) {
                const batch = phoneChunks.slice(i, i + CONCURRENT_LIMIT)
                const batchResults = await Promise.all(
                    batch.map(async (phones) => {
                        const chunkIds: string[] = []
                        let chunkOffset = 0
                        const PAGE_SIZE = 1000

                        while (true) {
                            let q = supabase.from('contacts').select('id').order('id', { ascending: true }).range(chunkOffset, chunkOffset + PAGE_SIZE - 1)

                            if (search) q = q.or(buildContactSearchOr(search))

                            if (tag && tag !== 'ALL') {
                                if (tag === 'NONE' || tag === '__NO_TAGS__') {
                                    q = q.or('tags.is.null,tags.eq.[]')
                                } else {
                                    q = q.filter('tags', 'cs', JSON.stringify([tag]))
                                }
                            }

                            q = q.in('phone', phones)

                            const { data, error } = await q
                            if (error) throw error

                            const rows = data || []
                            chunkIds.push(...rows.map(row => String(row.id)))

                            if (rows.length < PAGE_SIZE) break
                            chunkOffset += PAGE_SIZE
                        }

                        return chunkIds
                    })
                )
                chunkResults.push(...batchResults)
            }

            for (const ids of chunkResults) {
                for (const id of ids) {
                    if (!seen.has(id)) {
                        seen.add(id)
                        allIds.push(id)
                    }
                }
            }

            return allIds
        }

        const PAGE_SIZE = 1000
        const allIds: string[] = []
        let offset = 0

        while (true) {
            const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1)

            if (error) throw error

            const rows = data || []
            allIds.push(...rows.map(row => String(row.id)))

            if (rows.length < PAGE_SIZE) break
            offset += PAGE_SIZE
        }

        return allIds
    },

    getById: async (id: string): Promise<Contact | undefined> => {
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return undefined

        return mapRowToContact(data as ContactRow)
    },

    getByPhone: async (phone: string): Promise<Contact | undefined> => {
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('phone', phone)
            .single()

        if (error || !data) return undefined

        return mapRowToContact(data as ContactRow)
    },

    upsertMergeTagsByPhone: async (
        contact: Omit<Contact, 'id' | 'lastActive'>,
        tagsToMerge: string[]
    ): Promise<Contact> => {
        const normalizeTag = (t: string) => t.trim()
        const uniq = (arr: string[]) => Array.from(new Set(arr.map(normalizeTag).filter(Boolean)))

        const mergeCustomFields = (base: unknown, patch: unknown) => {
            const a = (base && typeof base === 'object') ? base : {}
            const b = (patch && typeof patch === 'object') ? patch : {}
            return { ...a, ...b }
        }

        const now = new Date().toISOString()

        const { data: existing } = await supabase
            .from('contacts')
            .select('*')
            .eq('phone', contact.phone)
            .single()

        if (existing) {
            const mergedTags = uniq([...flattenTags(existing.tags), ...(contact.tags || []), ...tagsToMerge])
            const mergedCustomFields = mergeCustomFields(existing.custom_fields, contact.custom_fields)
            const updateData: Partial<ContactRow> = {
                updated_at: now,
                tags: mergedTags,
                custom_fields: mergedCustomFields,
            }

            if (contact.name) updateData.name = contact.name
            if (contact.email !== undefined) updateData.email = contact.email
            if (contact.status) updateData.status = contact.status

            const { error: updateError } = await supabase
                .from('contacts')
                .update(updateData)
                .eq('id', existing.id)

            if (updateError) throw updateError

            return {
                id: existing.id,
                name: contact.name || existing.name,
                phone: existing.phone,
                email: contact.email ?? existing.email,
                status: (contact.status || existing.status) as ContactStatus,
                tags: mergedTags,
                custom_fields: mergedCustomFields,
                lastActive: 'Agora mesmo',
                createdAt: existing.created_at,
                updatedAt: now,
            }
        }

        const id = generateId()
        const mergedTags = uniq([...(contact.tags || []), ...tagsToMerge])

        const { error } = await supabase
            .from('contacts')
            .insert({
                id,
                name: contact.name || '',
                phone: contact.phone,
                email: contact.email || null,
                status: contact.status || ContactStatus.OPT_IN,
                tags: mergedTags,
                custom_fields: contact.custom_fields || {},
                created_at: now,
            })

        if (error) throw error

        return {
            ...contact,
            id,
            tags: mergedTags,
            lastActive: 'Agora mesmo',
            createdAt: now,
            updatedAt: now,
        }
    },

    add: async (contact: Omit<Contact, 'id' | 'lastActive'>): Promise<Contact> => {
        const { data: existing } = await supabase
            .from('contacts')
            .select('*')
            .eq('phone', contact.phone)
            .single()

        const now = new Date().toISOString()

        if (existing) {
            const updateData: Partial<ContactRow> = {
                updated_at: now
            }

            if (contact.name) updateData.name = contact.name
            if (contact.email !== undefined) updateData.email = contact.email
            if (contact.status) updateData.status = contact.status
            if (contact.tags) updateData.tags = flattenTags(contact.tags)
            if (contact.custom_fields) updateData.custom_fields = contact.custom_fields

            const { error: updateError } = await supabase
                .from('contacts')
                .update(updateData)
                .eq('id', existing.id)

            if (updateError) throw updateError

            return {
                id: existing.id,
                name: contact.name || existing.name,
                phone: existing.phone,
                email: contact.email ?? existing.email,
                status: (contact.status || existing.status) as ContactStatus,
                tags: flattenTags(contact.tags || existing.tags || []),
                custom_fields: contact.custom_fields || existing.custom_fields || {},
                lastActive: 'Agora mesmo',
                createdAt: existing.created_at,
                updatedAt: now,
            }
        }

        const id = generateId()

        const { error } = await supabase
            .from('contacts')
            .insert({
                id,
                name: contact.name || '',
                phone: contact.phone,
                email: contact.email || null,
                status: contact.status || ContactStatus.OPT_IN,
                tags: flattenTags(contact.tags),
                custom_fields: contact.custom_fields || {},
                created_at: now,
            })

        if (error) throw error

        return {
            ...contact,
            id,
            lastActive: 'Agora mesmo',
            createdAt: now,
            updatedAt: now,
        }
    },

    update: async (id: string, data: Partial<Contact>): Promise<Contact | undefined> => {
        const updateData: Record<string, unknown> = {}

        if (data.name !== undefined) updateData.name = data.name
        if (data.phone !== undefined) updateData.phone = data.phone
        if (data.email !== undefined) updateData.email = data.email
        if (data.status !== undefined) updateData.status = data.status
        if (data.tags !== undefined) updateData.tags = flattenTags(data.tags)
        if (data.custom_fields !== undefined) updateData.custom_fields = data.custom_fields

        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from('contacts')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        if (data.status === ContactStatus.OPT_IN) {
            const contact = await contactDb.getById(id)
            if (contact?.phone) {
                await supabase
                    .from('phone_suppressions')
                    .update({ is_active: false })
                    .eq('phone', contact.phone)
            }
            return contact
        }

        return contactDb.getById(id)
    },

    bulkSetCustomField: async (
        ids: string[],
        key: string,
        value: string
    ): Promise<{ updated: number; notFound: string[] }> => {
        const contactIds = Array.from(new Set((ids || []).map((v) => String(v || '').trim()).filter(Boolean)))
        const k = String(key || '').trim()
        const v = String(value ?? '').trim()
        if (contactIds.length === 0) return { updated: 0, notFound: [] }
        if (!k) return { updated: 0, notFound: contactIds }
        if (!v) return { updated: 0, notFound: [] }

        const ID_CHUNK_SIZE = 150
        const allData: any[] = []
        const idChunks = chunk(contactIds, ID_CHUNK_SIZE)

        const CONCURRENT_LIMIT = 5
        for (let i = 0; i < idChunks.length; i += CONCURRENT_LIMIT) {
            const batch = idChunks.slice(i, i + CONCURRENT_LIMIT)
            const batchResults = await Promise.all(
                batch.map(async (idBatch) => {
                    const { data: batchData, error: batchError } = await supabase
                        .from('contacts')
                        .select('*')
                        .in('id', idBatch)
                    if (batchError) throw batchError
                    return batchData || []
                })
            )
            for (const result of batchResults) {
                allData.push(...result)
            }
        }

        const data = allData as ContactRow[]
        const now = new Date().toISOString()
        const rows = data.map(row => {
            const base = (row.custom_fields && typeof row.custom_fields === 'object') ? row.custom_fields : {}
            const merged = { ...base, [k]: v }

            return {
                ...row,
                custom_fields: merged,
                updated_at: now,
            }
        })

        const foundIds = new Set(data.map(r => String(r.id)))
        const notFound = contactIds.filter((id) => !foundIds.has(id))

        if (rows.length === 0) {
            return { updated: 0, notFound }
        }

        const { error: upsertError } = await supabase
            .from('contacts')
            .upsert(rows, { onConflict: 'id' })

        if (upsertError) throw upsertError

        return { updated: rows.length, notFound }
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('contacts')
            .delete()
            .eq('id', id)

        if (error) throw error
    },

    deleteMany: async (ids: string[]): Promise<number> => {
        if (ids.length === 0) return 0

        const { data, error } = await supabase.rpc('bulk_delete_contacts', {
            p_ids: ids,
        })

        if (error) throw error
        return (data as number) || 0
    },

    bulkUpdateTags: async (
        ids: string[],
        tagsToAdd: string[],
        tagsToRemove: string[]
    ): Promise<number> => {
        if (ids.length === 0) return 0

        const { data, error } = await supabase.rpc('bulk_update_contact_tags', {
            p_ids: ids,
            p_tags_to_add: tagsToAdd,
            p_tags_to_remove: tagsToRemove,
        })

        if (error) throw error
        return (data as number) || 0
    },

    bulkUpdateStatus: async (
        ids: string[],
        status: ContactStatus
    ): Promise<number> => {
        if (ids.length === 0) return 0

        const { data, error } = await supabase
            .from('contacts')
            .update({ status, updated_at: new Date().toISOString() })
            .in('id', ids)
            .select('id, phone')

        if (error) throw error

        const updated = data?.length ?? 0

        if (status === ContactStatus.OPT_IN && updated > 0) {
            const phones = (data || [])
                .map((c) => c.phone)
                .filter(Boolean)
                .map((p) => normalizePhoneNumber(p))
                .filter((p) => validatePhoneNumber(p))
            if (phones.length > 0) {
                const { error: suppressionError } = await supabase
                    .from('phone_suppressions')
                    .update({ is_active: false })
                    .in('phone', phones)
                if (suppressionError) {
                    console.error('Erro ao desativar phone_suppressions:', suppressionError)
                }
            }
        }

        return updated
    },

    import: async (contacts: Omit<Contact, 'id' | 'lastActive'>[]): Promise<{ inserted: number; updated: number }> => {
        if (contacts.length === 0) return { inserted: 0, updated: 0 }

        const BATCH_SIZE = 500

        const chunkFn = <T>(arr: T[], size: number): T[][] =>
            Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
                arr.slice(i * size, i * size + size)
            )

        const now = new Date().toISOString()

        const normalizePhone = (p: string): string => {
            if (!p || typeof p !== 'string') return ''
            const digits = p.replace(/\D/g, '')
            if (!digits) return ''
            return `+${digits}`
        }

        const normalizedContacts = contacts
            .map(c => ({ ...c, phone: normalizePhone(c.phone) }))
            .filter(c => c.phone.length > 2)

        if (normalizedContacts.length === 0) return { inserted: 0, updated: 0 }

        const phones = [...new Set(normalizedContacts.map(c => c.phone))]

        const allExisting: ContactRow[] = []
        for (const batch of chunkFn(phones, BATCH_SIZE)) {
            const { data, error } = await supabase
                .from('contacts')
                .select('*')
                .in('phone', batch)
            if (error) throw error
            if (data) allExisting.push(...(data as ContactRow[]))
        }

        const existingByPhone = new Map(allExisting.map(c => [c.phone, c]))

        const toInsertMap = new Map<string, ContactRow>()
        const toUpdateMap = new Map<string, ContactRow>()

        for (const contact of normalizedContacts) {
            const existing = existingByPhone.get(contact.phone)

            if (existing) {
                const existingTags = flattenTags(existing.tags)
                const newTags = flattenTags(contact.tags)
                const mergedTags = [...new Set([...existingTags, ...newTags])]

                const existingCustomFields =
                    existing.custom_fields && typeof existing.custom_fields === 'object' && !Array.isArray(existing.custom_fields)
                        ? existing.custom_fields
                        : {}
                const contactCustomFields = 'custom_fields' in contact && typeof contact.custom_fields === 'object' && contact.custom_fields !== null && !Array.isArray(contact.custom_fields) ? contact.custom_fields : {}

                toUpdateMap.set(existing.id, {
                    id: existing.id,
                    phone: contact.phone,
                    name: contact.name || existing.name || '',
                    email: contact.email || existing.email || null,
                    status: existing.status,
                    tags: mergedTags,
                    custom_fields: { ...existingCustomFields, ...contactCustomFields },
                    created_at: existing.created_at,
                    updated_at: now,
                })
            } else {
                const contactCustomFields = 'custom_fields' in contact && typeof contact.custom_fields === 'object' && contact.custom_fields !== null && !Array.isArray(contact.custom_fields) ? contact.custom_fields : {}

                toInsertMap.set(contact.phone, {
                    id: generateId(),
                    name: contact.name || '',
                    phone: contact.phone,
                    email: contact.email || null,
                    status: contact.status || ContactStatus.OPT_IN,
                    tags: [...new Set(flattenTags(contact.tags))],
                    custom_fields: contactCustomFields,
                    created_at: now,
                    updated_at: now,
                })
            }
        }

        const deduplicatedInsert = Array.from(toInsertMap.values())
        const deduplicatedUpdate = Array.from(toUpdateMap.values())

        let insertedCount = 0
        for (const batch of chunkFn(deduplicatedInsert, BATCH_SIZE)) {
            const { error } = await supabase.from('contacts').insert(batch)
            if (error) throw error
            insertedCount += batch.length
        }

        let updatedCount = 0
        for (const batch of chunkFn(deduplicatedUpdate, BATCH_SIZE)) {
            const { error } = await supabase
                .from('contacts')
                .upsert(batch, { onConflict: 'id' })
            if (error) throw error
            updatedCount += batch.length
        }

        return { inserted: insertedCount, updated: updatedCount }
    },

    getTags: async (): Promise<string[]> => {
        const { data, error } = await supabase.rpc('get_contact_tags')

        if (error) {
            console.error('Failed to get contact tags:', error)
            throw error
        }

        if (Array.isArray(data)) return flattenTags(data)
        if (typeof data === 'string') {
            try {
                const parsed = JSON.parse(data)
                return Array.isArray(parsed) ? flattenTags(parsed) : []
            } catch {
                return []
            }
        }
        return []
    },

    getStats: async () => {
        const { data, error } = await supabase.rpc('get_contact_stats')

        if (error) {
            console.error('Failed to get contact stats:', error)
            throw error
        }

        return {
            total: data?.total || 0,
            optIn: data?.optIn || 0,
            optOut: data?.optOut || 0,
        }
    },
}
