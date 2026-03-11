import { supabase } from '../supabase'
import {
    Campaign,
    CampaignStatus,
    CampaignTag
} from '../../types'

// Gera um ID compatível com UUID fallback (copiado do index temporariamente)
import { nanoid } from 'nanoid'
const generateId = () => {
    try {
        if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
    } catch { }
    return nanoid()
}

interface CampaignRow {
    id: string
    name: string
    status: string
    template_name: string
    template_variables: { header: string[], headerMediaId?: string, body: string[], buttons?: Record<string, string> } | null
    template_snapshot: any | null
    template_spec_hash: string | null
    template_parameter_format: 'positional' | 'named' | null
    template_fetched_at: string | null
    total_recipients: number
    sent: number
    delivered: number
    read: number
    skipped: number | null
    failed: number
    created_at: string
    scheduled_date: string | null
    qstash_schedule_message_id: string | null
    qstash_schedule_enqueued_at: string | null
    started_at: string | null
    first_dispatch_at: string | null
    last_sent_at: string | null
    completed_at: string | null
    cancelled_at: string | null
    flow_id: string | null
    flow_name: string | null
    folder_id: string | null
    campaign_folders?: {
        id: string
        name: string
        color: string
        created_at: string
        updated_at: string
    } | null
}

const mapRowToCampaign = (row: CampaignRow, tags?: CampaignTag[]): Campaign => ({
    id: row.id,
    name: row.name,
    status: row.status as CampaignStatus,
    templateName: row.template_name,
    templateVariables: row.template_variables || undefined,
    templateSnapshot: row.template_snapshot ?? undefined,
    templateSpecHash: row.template_spec_hash ?? null,
    templateParameterFormat: row.template_parameter_format ?? null,
    templateFetchedAt: row.template_fetched_at ?? null,
    recipients: row.total_recipients,
    sent: row.sent,
    delivered: row.delivered,
    read: row.read,
    skipped: row.skipped || 0,
    failed: row.failed,
    createdAt: row.created_at,
    scheduledAt: row.scheduled_date,
    qstashScheduleMessageId: row.qstash_schedule_message_id ?? null,
    qstashScheduleEnqueuedAt: row.qstash_schedule_enqueued_at ?? null,
    startedAt: row.started_at,
    firstDispatchAt: row.first_dispatch_at ?? null,
    lastSentAt: row.last_sent_at ?? null,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at ?? null,
    flowId: row.flow_id ?? null,
    flowName: row.flow_name ?? null,
    folderId: row.folder_id ?? null,
    folder: row.campaign_folders ? {
        id: row.campaign_folders.id,
        name: row.campaign_folders.name,
        color: row.campaign_folders.color,
        createdAt: row.campaign_folders.created_at,
        updatedAt: row.campaign_folders.updated_at,
    } : null,
    tags: tags || [],
})

export const campaignDb = {
    getAll: async (): Promise<Campaign[]> => {
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data as CampaignRow[] || []).map(row => mapRowToCampaign(row))
    },

    list: async (params: {
        limit: number
        offset: number
        search?: string | null
        status?: string | null
        folderId?: string | null  // null = todas, 'none' = sem pasta, UUID = pasta específica
        tagIds?: string[] | null  // IDs das tags para filtrar (AND)
    }): Promise<{ data: Campaign[]; total: number }> => {
        const limit = Math.max(1, Math.min(100, Math.floor(params.limit || 20)))
        const offset = Math.max(0, Math.floor(params.offset || 0))
        const search = (params.search || '').trim()
        const status = (params.status || '').trim()
        const folderId = params.folderId ?? null
        const tagIds = params.tagIds ?? null

        // Se filtrar por tags, usamos RPC para buscar em uma única query (evita N+1)
        let campaignIdsWithTags: string[] | null = null
        if (tagIds && tagIds.length > 0) {
            const { data: campaignIds, error: tagError } = await supabase.rpc(
                'get_campaigns_with_all_tags',
                { p_tag_ids: tagIds }
            )

            if (tagError) {
                console.error('Failed to get campaigns by tags:', tagError)
                throw tagError
            }

            const resolvedIds: string[] = campaignIds || []

            // Se não houver campanhas com todas as tags, retorna vazio
            if (resolvedIds.length === 0) {
                return { data: [], total: 0 }
            }

            campaignIdsWithTags = resolvedIds
        }

        let query = supabase
            .from('campaigns')
            .select(
                '*,campaign_folders(id,name,color,created_at,updated_at)',
                { count: 'exact' }
            )

        if (search) {
            const like = `%${search}%`
            query = query.or(`name.ilike.${like},template_name.ilike.${like}`)
        }

        if (status && status !== 'All') {
            query = query.eq('status', status)
        }

        // Filtro por pasta
        if (folderId === 'none') {
            query = query.is('folder_id', null)
        } else if (folderId) {
            query = query.eq('folder_id', folderId)
        }

        // Filtro por tags (campanhas que têm TODAS as tags selecionadas)
        if (campaignIdsWithTags !== null) {
            query = query.in('id', campaignIdsWithTags)
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (error) throw error

        // Buscar as tags de cada campanha
        const campaignIds = (data || []).map((r: any) => r.id)
        let tagsMap = new Map<string, CampaignTag[]>()

        if (campaignIds.length > 0) {
            const { data: tagAssignments } = await supabase
                .from('campaign_tag_assignments')
                .select(`
                    campaign_id,
                    campaign_tags (
                        id,
                        name,
                        color,
                        created_at
                    )
                `)
                .in('campaign_id', campaignIds)

                ; (tagAssignments || []).forEach((row: any) => {
                    const campaignId = row.campaign_id
                    const tag = row.campaign_tags
                    if (tag) {
                        const existing = tagsMap.get(campaignId) || []
                        existing.push({
                            id: tag.id,
                            name: tag.name,
                            color: tag.color,
                            createdAt: tag.created_at,
                        })
                        tagsMap.set(campaignId, existing)
                    }
                })
        }

        return {
            data: ((data as unknown) as CampaignRow[] || []).map(row => mapRowToCampaign(row, tagsMap.get(row.id))),
            total: count || 0,
        }
    },

    getById: async (id: string): Promise<Campaign | undefined> => {
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return undefined

        return mapRowToCampaign(data as CampaignRow)
    },

    create: async (campaign: {
        name: string
        templateName: string
        recipients: number
        scheduledAt?: string
        templateVariables?: { header: string[], headerMediaId?: string, body: string[], buttons?: Record<string, string> }
        flowId?: string | null
        flowName?: string | null
        folderId?: string | null
    }): Promise<Campaign> => {
        const id = generateId()
        const now = new Date().toISOString()
        const status = campaign.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT

        const { data, error } = await supabase
            .from('campaigns')
            .insert({
                id,
                name: campaign.name,
                status,
                template_name: campaign.templateName,
                template_variables: campaign.templateVariables,
                total_recipients: campaign.recipients,
                sent: 0,
                delivered: 0,
                read: 0,
                failed: 0,
                skipped: 0,
                created_at: now,
                scheduled_date: campaign.scheduledAt,
                started_at: null,
                cancelled_at: null,
                flow_id: campaign.flowId ?? null,
                flow_name: campaign.flowName ?? null,
                folder_id: campaign.folderId ?? null,
            })
            .select()
            .single()

        if (error) throw error

        return {
            id,
            name: campaign.name,
            status,
            templateName: campaign.templateName,
            templateVariables: campaign.templateVariables,
            recipients: campaign.recipients,
            sent: 0,
            delivered: 0,
            read: 0,
            skipped: 0,
            failed: 0,
            createdAt: now,
            scheduledAt: campaign.scheduledAt,
            startedAt: undefined,
            cancelledAt: undefined,
            flowId: campaign.flowId ?? null,
            flowName: campaign.flowName ?? null,
        }
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('campaigns')
            .delete()
            .eq('id', id)

        if (error) throw error
    },

    duplicate: async (id: string): Promise<Campaign | undefined> => {
        const original = await campaignDb.getById(id)
        if (!original) return undefined

        const newId = generateId()
        const now = new Date().toISOString()
        const existingContacts: any[] = []
        let dupOffset = 0
        const DUP_PAGE_SIZE = 1000

        while (true) {
            const { data: page, error: existingContactsError } = await supabase
                .from('campaign_contacts')
                .select('contact_id, phone, name, email, custom_fields')
                .eq('campaign_id', id)
                .order('id', { ascending: true })
                .range(dupOffset, dupOffset + DUP_PAGE_SIZE - 1)

            if (existingContactsError) throw existingContactsError

            const rows = page || []
            existingContacts.push(...rows)

            if (rows.length < DUP_PAGE_SIZE) break
            dupOffset += DUP_PAGE_SIZE
        }

        const recipientsCount = existingContacts?.length ?? original.recipients ?? 0

        const { error } = await supabase
            .from('campaigns')
            .insert({
                id: newId,
                name: `${original.name} (Cópia)`,
                status: CampaignStatus.DRAFT,
                template_name: original.templateName,
                template_variables: original.templateVariables,
                template_snapshot: original.templateSnapshot ?? null,
                template_spec_hash: original.templateSpecHash ?? null,
                template_parameter_format: original.templateParameterFormat ?? null,
                template_fetched_at: original.templateFetchedAt ?? null,
                total_recipients: recipientsCount,
                sent: 0,
                delivered: 0,
                read: 0,
                skipped: 0,
                failed: 0,
                created_at: now,
                scheduled_date: null,
                started_at: null,
                completed_at: null,
                flow_id: original.flowId ?? null,
                flow_name: original.flowName ?? null,
            })

        if (error) throw error

        if (existingContacts && existingContacts.length > 0) {
            const newContacts = existingContacts.map((c: { contact_id: string; phone: string; name: string; email: string | null; custom_fields: Record<string, unknown> | null }) => ({
                id: generateId(),
                campaign_id: newId,
                contact_id: c.contact_id,
                phone: c.phone,
                name: c.name,
                email: c.email ?? null,
                custom_fields: c.custom_fields || {},
                status: 'pending',
            }))

            const { error: insertContactsError } = await supabase
                .from('campaign_contacts')
                .insert(newContacts)

            if (insertContactsError) {
                // Rollback best-effort: não deixar uma campanha “cópia” sem público.
                await supabase.from('campaigns').delete().eq('id', newId)
                throw insertContactsError
            }
        }

        return campaignDb.getById(newId)
    },

    updateStatus: async (id: string, updates: Partial<Campaign>): Promise<Campaign | undefined> => {
        const updateData: Record<string, unknown> = {}

        if (updates.status !== undefined) updateData.status = updates.status
        if (updates.sent !== undefined) updateData.sent = updates.sent
        if (updates.delivered !== undefined) updateData.delivered = updates.delivered
        if (updates.read !== undefined) updateData.read = updates.read
        if (updates.skipped !== undefined) updateData.skipped = updates.skipped
        if (updates.failed !== undefined) updateData.failed = updates.failed
        if (updates.completedAt !== undefined) updateData.completed_at = updates.completedAt
        if (updates.cancelledAt !== undefined) updateData.cancelled_at = updates.cancelledAt
        if (updates.startedAt !== undefined) updateData.started_at = updates.startedAt
        if (updates.firstDispatchAt !== undefined) updateData.first_dispatch_at = updates.firstDispatchAt
        if (updates.lastSentAt !== undefined) updateData.last_sent_at = updates.lastSentAt
        if (updates.scheduledAt !== undefined) updateData.scheduled_date = updates.scheduledAt
        if (updates.qstashScheduleMessageId !== undefined) updateData.qstash_schedule_message_id = updates.qstashScheduleMessageId
        if (updates.qstashScheduleEnqueuedAt !== undefined) updateData.qstash_schedule_enqueued_at = updates.qstashScheduleEnqueuedAt
        if (updates.templateSnapshot !== undefined) updateData.template_snapshot = updates.templateSnapshot
        if (updates.templateSpecHash !== undefined) updateData.template_spec_hash = updates.templateSpecHash
        if (updates.templateParameterFormat !== undefined) updateData.template_parameter_format = updates.templateParameterFormat
        if (updates.templateFetchedAt !== undefined) updateData.template_fetched_at = updates.templateFetchedAt
        if (updates.folderId !== undefined) updateData.folder_id = updates.folderId

        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from('campaigns')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        return campaignDb.getById(id)
    },

    pause: async (id: string): Promise<Campaign | undefined> => {
        return campaignDb.updateStatus(id, { status: CampaignStatus.PAUSED })
    },

    resume: async (id: string): Promise<Campaign | undefined> => {
        return campaignDb.updateStatus(id, {
            status: CampaignStatus.SENDING,
            startedAt: new Date().toISOString()
        })
    },

    start: async (id: string): Promise<Campaign | undefined> => {
        return campaignDb.updateStatus(id, {
            status: CampaignStatus.SENDING,
            startedAt: new Date().toISOString()
        })
    },
}
