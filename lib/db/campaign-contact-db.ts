import { supabase } from '../supabase'

// Helpers
import { nanoid } from 'nanoid'
const generateId = () => {
    try {
        if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
    } catch { }
    return nanoid()
}

export const campaignContactDb = {
    addContacts: async (
        campaignId: string,
        contacts: { contactId: string, phone: string, name: string, email?: string | null, custom_fields?: Record<string, unknown> }[]
    ): Promise<void> => {
        const rows = contacts.map(contact => ({
            id: generateId(),
            campaign_id: campaignId,
            contact_id: contact.contactId,
            phone: contact.phone,
            name: contact.name,
            email: contact.email || null,
            custom_fields: contact.custom_fields || {},
            status: 'pending',
        }))

        const { error } = await supabase
            .from('campaign_contacts')
            .insert(rows)

        if (error) throw error
    },

    // LEGADO: esta função carrega no máximo 1000 registros e deve ser evitada
    // para campanhas com muitos contatos. Implemente paginação no consumidor se necessário.
    getContacts: async (campaignId: string) => {
        // Limite explícito: sem .limit() o PostgREST silenciosamente trunca em 1000 rows.
        const { data, error } = await supabase
            .from('campaign_contacts')
            .select('*')
            .eq('campaign_id', campaignId)
            .order('sent_at', { ascending: false })
            .limit(1000)

        if (error) throw error

        return (data || []).map((row: any) => ({
            id: row.id,
            campaignId: row.campaign_id,
            contactId: row.contact_id,
            phone: row.phone,
            name: row.name,
            status: row.status,
            messageId: row.message_id,
            sentAt: row.sent_at,
            deliveredAt: row.delivered_at,
            readAt: row.read_at,
            error: row.error,
            custom_fields: row.custom_fields,
        }))
    },

    updateStatus: async (campaignId: string, phone: string, status: string, messageId?: string, error?: string): Promise<void> => {
        const now = new Date().toISOString()
        const updateData: Record<string, unknown> = { status }

        if (messageId) updateData.message_id = messageId
        if (error) updateData.error = error
        if (status === 'sent') updateData.sent_at = now
        if (status === 'delivered') updateData.delivered_at = now
        if (status === 'read') updateData.read_at = now

        const { error: dbError } = await supabase
            .from('campaign_contacts')
            .update(updateData)
            .eq('campaign_id', campaignId)
            .eq('phone', phone)

        if (dbError) throw dbError
    },
}
