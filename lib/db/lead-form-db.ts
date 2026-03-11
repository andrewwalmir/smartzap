import { supabase } from '../supabase'
import {
    LeadForm,
    CreateLeadFormDTO,
    UpdateLeadFormDTO
} from '../../types'

// Helpers
import { nanoid } from 'nanoid'
const generateId = () => {
    try {
        if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
    } catch { }
    return nanoid()
}

const generateWebhookToken = () => {
    try {
        if (typeof globalThis.crypto?.randomUUID === 'function') {
            return globalThis.crypto.randomUUID().replace(/-/g, '') +
                globalThis.crypto.randomUUID().replace(/-/g, '').substring(0, 16)
        }
    } catch { }
    return nanoid(48)
}

interface LeadFormRow {
    id: string
    name: string
    slug: string
    tag: string
    is_active: boolean
    collect_email: boolean | null
    success_message: string | null
    webhook_token: string | null
    fields: any
    created_at: string
    updated_at: string | null
}

const mapRowToLeadForm = (row: LeadFormRow): LeadForm => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    tag: row.tag,
    isActive: !!row.is_active,
    collectEmail: row.collect_email ?? true,
    successMessage: row.success_message ?? null,
    webhookToken: row.webhook_token ?? null,
    fields: Array.isArray(row.fields) ? row.fields : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
})

export const leadFormDb = {
    getAll: async (): Promise<LeadForm[]> => {
        const { data, error } = await supabase
            .from('lead_forms')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data as LeadFormRow[] || []).map(mapRowToLeadForm)
    },

    getById: async (id: string): Promise<LeadForm | undefined> => {
        const { data, error } = await supabase
            .from('lead_forms')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return undefined

        return mapRowToLeadForm(data as LeadFormRow)
    },

    getBySlug: async (slug: string): Promise<LeadForm | undefined> => {
        const { data, error } = await supabase
            .from('lead_forms')
            .select('*')
            .eq('slug', slug)
            .single()

        if (error || !data) return undefined

        return mapRowToLeadForm(data as LeadFormRow)
    },

    create: async (dto: CreateLeadFormDTO): Promise<LeadForm> => {
        const now = new Date().toISOString()
        const id = `lf_${generateId().replace(/-/g, '')}`
        const webhookToken = generateWebhookToken()

        const { error } = await supabase
            .from('lead_forms')
            .insert({
                id,
                name: dto.name,
                slug: dto.slug,
                tag: dto.tag,
                is_active: dto.isActive ?? true,
                collect_email: dto.collectEmail ?? true,
                success_message: dto.successMessage ?? null,
                webhook_token: webhookToken,
                fields: dto.fields || [],
                created_at: now,
                updated_at: now,
            })

        if (error) throw error

        return {
            id,
            name: dto.name,
            slug: dto.slug,
            tag: dto.tag,
            isActive: dto.isActive ?? true,
            collectEmail: dto.collectEmail ?? true,
            successMessage: dto.successMessage ?? null,
            webhookToken,
            fields: dto.fields || [],
            createdAt: now,
            updatedAt: now,
        }
    },

    update: async (id: string, dto: UpdateLeadFormDTO): Promise<LeadForm | undefined> => {
        const updateData: Record<string, unknown> = {}

        if (dto.name !== undefined) updateData.name = dto.name
        if (dto.slug !== undefined) updateData.slug = dto.slug
        if (dto.tag !== undefined) updateData.tag = dto.tag
        if (dto.isActive !== undefined) updateData.is_active = dto.isActive
        if (dto.collectEmail !== undefined) updateData.collect_email = dto.collectEmail
        if (dto.successMessage !== undefined) updateData.success_message = dto.successMessage
        if (dto.fields !== undefined) updateData.fields = dto.fields
        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from('lead_forms')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        return leadFormDb.getById(id)
    },

    rotateWebhookToken: async (id: string): Promise<LeadForm | undefined> => {
        const token = generateWebhookToken()

        const { error } = await supabase
            .from('lead_forms')
            .update({ webhook_token: token, updated_at: new Date().toISOString() })
            .eq('id', id)

        if (error) throw error
        return leadFormDb.getById(id)
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('lead_forms')
            .delete()
            .eq('id', id)

        if (error) throw error
    },
}
