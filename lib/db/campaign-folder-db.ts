import { supabase } from '../supabase'
import {
    CampaignFolder,
    CreateCampaignFolderDTO,
    UpdateCampaignFolderDTO
} from '../../types'

export const campaignFolderDb = {
    getAll: async (): Promise<CampaignFolder[]> => {
        const { data, error } = await supabase
            .from('campaign_folders')
            .select('*')
            .order('name', { ascending: true })

        if (error) throw error

        return (data || []).map((row: any) => ({
            id: row.id,
            name: row.name,
            color: row.color,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }))
    },

    getAllWithCounts: async (): Promise<CampaignFolder[]> => {
        // Get folders
        const { data: folders, error: foldersError } = await supabase
            .from('campaign_folders')
            .select('*')
            .order('name', { ascending: true })

        if (foldersError) throw foldersError

        // Get campaign counts per folder.
        // Limite explícito de 5000: sem .limit() o PostgREST trunca silenciosamente em 1000
        // rows, fazendo as contagens ficarem incorretas para instalações com muitas campanhas.
        const { data: campaigns, error: campaignsError } = await supabase
            .from('campaigns')
            .select('folder_id')
            .limit(5000)

        if (campaignsError) throw campaignsError

        if ((campaigns?.length ?? 0) >= 5000) {
            console.warn('campaignFolderDb.getAllWithCounts(): limite de 5000 campanhas atingido — contagens de pasta podem estar incompletas')
        }

        // Count campaigns per folder
        const countMap = new Map<string, number>()
            ; (campaigns || []).forEach((c: any) => {
                if (c.folder_id) {
                    countMap.set(c.folder_id, (countMap.get(c.folder_id) || 0) + 1)
                }
            })

        return (folders || []).map((row: any) => ({
            id: row.id,
            name: row.name,
            color: row.color,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            campaignCount: countMap.get(row.id) || 0,
        }))
    },

    getById: async (id: string): Promise<CampaignFolder | undefined> => {
        const { data, error } = await supabase
            .from('campaign_folders')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return undefined

        return {
            id: data.id,
            name: data.name,
            color: data.color,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        }
    },

    create: async (dto: CreateCampaignFolderDTO): Promise<CampaignFolder> => {
        const { data, error } = await supabase
            .from('campaign_folders')
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
            updatedAt: data.updated_at,
        }
    },

    update: async (id: string, dto: UpdateCampaignFolderDTO): Promise<CampaignFolder | undefined> => {
        const updateData: Record<string, unknown> = {}

        if (dto.name !== undefined) updateData.name = dto.name
        if (dto.color !== undefined) updateData.color = dto.color

        const { error } = await supabase
            .from('campaign_folders')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        return campaignFolderDb.getById(id)
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('campaign_folders')
            .delete()
            .eq('id', id)

        if (error) throw error
    },

    // Contagem de campanhas sem pasta
    getUnfiledCount: async (): Promise<number> => {
        const { count, error } = await supabase
            .from('campaigns')
            .select('*', { count: 'exact', head: true })
            .is('folder_id', null)

        if (error) throw error
        return count || 0
    },

    // Total de campanhas
    getTotalCount: async (): Promise<number> => {
        const { count, error } = await supabase
            .from('campaigns')
            .select('*', { count: 'exact', head: true })

        if (error) throw error
        return count || 0
    },
}
