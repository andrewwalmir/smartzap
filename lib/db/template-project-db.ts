import { supabase } from '../supabase'
import {
    TemplateProject,
    TemplateProjectItem,
    CreateTemplateProjectDTO
} from '../../types'

export const templateProjectDb = {
    getAll: async (): Promise<TemplateProject[]> => {
        const { data, error } = await supabase
            .from('template_projects')
            .select(`
                *,
                template_project_items (
                    id,
                    meta_status
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map((project: any) => {
            const items = project.template_project_items || [];
            const approvedCount = items.filter((i: { meta_status?: string }) => i.meta_status === 'APPROVED').length;
            const templateCount = items.length;

            const { template_project_items, ...projectWithoutItems } = project;

            return {
                ...projectWithoutItems,
                template_count: templateCount,
                approved_count: approvedCount
            } as TemplateProject;
        });
    },

    getById: async (id: string): Promise<TemplateProject & { items: TemplateProjectItem[] }> => {
        const { data: project, error: projectError } = await supabase
            .from('template_projects')
            .select('*')
            .eq('id', id)
            .single();

        if (projectError) throw projectError;

        const { data: items, error: itemsError } = await supabase
            .from('template_project_items')
            .select('*')
            .eq('project_id', id)
            .order('created_at', { ascending: true });

        if (itemsError) throw itemsError;

        return { ...(project as TemplateProject), items: (items as TemplateProjectItem[]) || [] };
    },

    create: async (dto: CreateTemplateProjectDTO): Promise<TemplateProject> => {
        const { data: project, error: projectError } = await supabase
            .from('template_projects')
            .insert({
                title: dto.title,
                prompt: dto.prompt,
                status: dto.status || 'draft',
                source: ('source' in dto ? String(dto.source) : undefined) || 'ai',
                strategy: dto.strategy || 'utility',
                template_count: dto.items.length,
                approved_count: 0
            })
            .select()
            .single();

        if (projectError) throw projectError;

        if (dto.items.length > 0) {
            const itemsToInsert = dto.items.map(item => ({
                ...item,
                project_id: project.id
            }));

            const { error: itemsError } = await supabase
                .from('template_project_items')
                .insert(itemsToInsert);

            if (itemsError) {
                console.error('Error creating items:', itemsError);
                throw itemsError;
            }
        }

        return project as TemplateProject;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('template_projects')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    updateItem: async (id: string, updates: Partial<TemplateProjectItem>): Promise<TemplateProjectItem> => {
        const { data, error } = await supabase
            .from('template_project_items')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as TemplateProjectItem;
    },

    deleteItem: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('template_project_items')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    update: async (id: string, updates: Partial<{ title: string; status: string }>): Promise<TemplateProject> => {
        const { data, error } = await supabase
            .from('template_projects')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as TemplateProject;
    }
};
