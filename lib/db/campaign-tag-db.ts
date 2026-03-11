import { supabase } from '../supabase'
import {
    CampaignTag,
    CreateCampaignTagDTO
} from '../../types'

export const campaignTagDb = {
    getAll: async (): Promise<CampaignTag[]> => {
        const { data, error } = await supabase
            .from('campaign_tags')
            .select('*')
            .order('name', { ascending: true })

        if (error) throw error

        return (data || []).map((row: any) => ({
            id: row.id,
            name: row.name,
            color: row.color,
            createdAt: row.created_at,
        }))
    },

    getById: async (id: string): Promise<CampaignTag | undefined> => {
        const { data, error } = await supabase
            .from('campaign_tags')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return undefined

        return {
            id: data.id,
            name: data.name,
            color: data.color,
            createdAt: data.created_at,
        }
    },

    create: async (dto: CreateCampaignTagDTO): Promise<CampaignTag> => {
        const { data, error } = await supabase
            .from('campaign_tags')
            .insert({
                name: dto.name,
                color: dto.color || '#6B7280',
            })
            .select()
            .single()

        if (error) throw error

        return {
            id: data.id,
            name: data.name,
            color: data.color,
            createdAt: data.created_at,
        }
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('campaign_tags')
            .delete()
            .eq('id', id)

        if (error) throw error
    },

    // Obtém as tags de uma campanha
    getForCampaign: async (campaignId: string): Promise<CampaignTag[]> => {
        const { data, error } = await supabase
            .from('campaign_tag_assignments')
            .select(`
                tag_id,
                campaign_tags (
                    id,
                    name,
                    color,
                    created_at
                )
            `)
            .eq('campaign_id', campaignId)

        if (error) throw error

        return (data || [])
            .map((row: any) => row.campaign_tags)
            .filter(Boolean)
            .map((tag: any) => ({
                id: tag.id,
                name: tag.name,
                color: tag.color,
                createdAt: tag.created_at,
            }))
    },

    // Atribui tags a uma campanha (substitui todas as tags existentes)
    assignToCampaign: async (campaignId: string, tagIds: string[]): Promise<void> => {
        // Primeiro, remove todas as tags existentes
        const { error: deleteError } = await supabase
            .from('campaign_tag_assignments')
            .delete()
            .eq('campaign_id', campaignId)

        if (deleteError) throw deleteError

        // Depois, insere as novas tags
        if (tagIds.length > 0) {
            const rows = tagIds.map(tagId => ({
                campaign_id: campaignId,
                tag_id: tagId,
            }))

            const { error: insertError } = await supabase
                .from('campaign_tag_assignments')
                .insert(rows)

            if (insertError) throw insertError
        }
    },

    // Adiciona uma tag a uma campanha
    addToCampaign: async (campaignId: string, tagId: string): Promise<void> => {
        const { error } = await supabase
            .from('campaign_tag_assignments')
            .upsert({
                campaign_id: campaignId,
                tag_id: tagId,
            }, { onConflict: 'campaign_id,tag_id' })

        if (error) throw error
    },

    // Remove uma tag de uma campanha
    removeFromCampaign: async (campaignId: string, tagId: string): Promise<void> => {
        const { error } = await supabase
            .from('campaign_tag_assignments')
            .delete()
            .eq('campaign_id', campaignId)
            .eq('tag_id', tagId)

        if (error) throw error
    },
}
