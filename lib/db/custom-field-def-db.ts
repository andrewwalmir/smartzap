import { supabase } from '../supabase'
import { CustomFieldDefinition } from '../../types'

// Helpers
import { nanoid } from 'nanoid'
const generateId = () => {
    try {
        if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
    } catch { }
    return nanoid()
}

export const customFieldDefDb = {
    getAll: async (entityType: 'contact' | 'deal'): Promise<CustomFieldDefinition[]> => {
        const { data, error } = await supabase
            .from('custom_field_definitions')
            .select('*')
            .eq('entity_type', entityType)
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data || []).map((row: any) => ({
            id: row.id,
            key: row.key,
            label: row.label,
            type: row.type,
            options: row.options,
            entity_type: row.entity_type,
            created_at: row.created_at,
        }))
    },

    create: async (def: Omit<CustomFieldDefinition, 'id' | 'created_at'>): Promise<CustomFieldDefinition> => {
        const id = generateId()
        const now = new Date().toISOString()


        // Fetch organization_id (company_id) from settings
        const { data: orgData } = await supabase.from('settings').select('value').eq('key', 'company_id').single()
        const organization_id = orgData?.value

        const { data, error } = await supabase
            .from('custom_field_definitions')
            .insert({
                id,
                key: def.key,
                label: def.label,
                type: def.type,
                options: def.options,
                entity_type: def.entity_type,
                created_at: now,
                organization_id: organization_id
            })
            .select()
            .single()

        if (error) throw error

        return {
            id: data.id,
            key: data.key,
            label: data.label,
            type: data.type,
            options: data.options,
            entity_type: data.entity_type,
            created_at: data.created_at,
        }
    },

    delete: async (id: string): Promise<void> => {
        const { error, count } = await supabase
            .from('custom_field_definitions')
            .delete({ count: 'exact' })
            .eq('id', id)

        console.log('[DEBUG] Deleting custom field:', { id, count, error });

        if (error) throw error
    },
}
