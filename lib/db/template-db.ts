import { supabase } from '../supabase'
import {
    Template,
    TemplateComponent,
    TemplateStatus
} from '../../types'
import { canonicalTemplateCategory } from '@/lib/template-category'

interface TemplateRow {
    id: string
    name: string
    category: string
    language: string
    status: string
    components: unknown
    parameter_format: string | null
    spec_hash: string | null
    fetched_at: string | null
    header_location: unknown | null
    header_media_id: string | null
    header_media_hash: string | null
    header_media_preview_url: string | null
    header_media_preview_expires_at: string | null
    created_at: string
    updated_at: string | null
}

const normalizeTemplateFormat = (format: unknown): TemplateComponent['format'] | undefined => {
    if (typeof format !== 'string') return undefined
    const normalized = format.toUpperCase()
    if (normalized === 'TEXT' || normalized === 'IMAGE' || normalized === 'VIDEO' || normalized === 'DOCUMENT' || normalized === 'GIF' || normalized === 'LOCATION') {
        return normalized as TemplateComponent['format']
    }
    return undefined
}

const normalizeTemplateComponents = (input: unknown): TemplateComponent[] => {
    if (!input) return []
    if (Array.isArray(input)) return input as TemplateComponent[]
    if (typeof input === 'string') {
        try {
            const parsed = JSON.parse(input)
            return normalizeTemplateComponents(parsed)
        } catch {
            return [{ type: 'BODY', text: input }]
        }
    }
    if (typeof input !== 'object') return []

    const value = input as Record<string, unknown>
    if (Array.isArray(value.components)) {
        return value.components as TemplateComponent[]
    }

    const components: TemplateComponent[] = []
    const header = value.header
    const body = value.body
    const footer = value.footer
    const buttons = value.buttons

    if (header) {
        if (typeof header === 'string') {
            components.push({ type: 'HEADER', format: 'TEXT', text: header })
        } else if (typeof header === 'object') {
            const headerComponent: TemplateComponent = { type: 'HEADER' }
            const headerObj = header as Record<string, unknown>
            const format = normalizeTemplateFormat(headerObj.format)
            if (format) headerComponent.format = format
            if (typeof headerObj.text === 'string') headerComponent.text = headerObj.text
            if (headerObj.example !== undefined) headerComponent.example = headerObj.example
            components.push(headerComponent)
        }
    }

    if (body !== undefined) {
        if (typeof body === 'string') {
            components.push({ type: 'BODY', text: body })
        } else if (typeof body === 'object' && body !== null) {
            const bodyObj = body as Record<string, unknown>
            const bodyComponent: TemplateComponent = { type: 'BODY' }
            if (typeof bodyObj.text === 'string') bodyComponent.text = bodyObj.text
            if (bodyObj.example !== undefined) bodyComponent.example = bodyObj.example
            components.push(bodyComponent)
        }
    } else if (typeof value.content === 'string') {
        components.push({ type: 'BODY', text: value.content })
    }

    if (footer) {
        if (typeof footer === 'string') {
            components.push({ type: 'FOOTER', text: footer })
        } else if (typeof footer === 'object' && footer !== null) {
            const footerObj = footer as Record<string, unknown>
            const footerText = typeof footerObj.text === 'string' ? footerObj.text : undefined
            if (footerText) {
                components.push({ type: 'FOOTER', text: footerText })
            }
        }
    }

    if (Array.isArray(buttons)) {
        components.push({ type: 'BUTTONS', buttons })
    }

    return components
}

const getTemplateBodyText = (components: TemplateComponent[], raw: unknown): string => {
    const bodyComponent = components.find(c => c.type === 'BODY' && typeof c.text === 'string')
    if (bodyComponent?.text) return bodyComponent.text

    if (raw && typeof raw === 'object') {
        const maybe = raw as Record<string, unknown>
        if (typeof maybe.content === 'string') return maybe.content
        if (maybe.body && typeof maybe.body === 'object') {
            const bodyObj = maybe.body as Record<string, unknown>
            if (typeof bodyObj.text === 'string') return bodyObj.text
        }
    }

    return ''
}

const normalizeParameterFormat = (value: unknown): 'positional' | 'named' | undefined => {
    if (value === null || value === undefined) return undefined
    const normalized = String(value).toLowerCase()
    return normalized === 'named' ? 'named' : 'positional'
}

const mapRowToTemplate = (row: TemplateRow): Template => {
    let components = normalizeTemplateComponents(row.components)
    const bodyText = getTemplateBodyText(components, row.components)

    const headerLocation = row.header_location
    if (headerLocation && typeof headerLocation === 'object') {
        components = components.map(c => {
            if (c.type === 'HEADER' && c.format === 'LOCATION') {
                return { ...c, location: headerLocation }
            }
            return c
        })
    }

    return {
        id: row.id,
        name: row.name,
        category: canonicalTemplateCategory(row.category),
        language: row.language,
        status: (row.status as TemplateStatus) || 'PENDING',
        parameterFormat: normalizeParameterFormat(row.parameter_format),
        specHash: row.spec_hash ?? null,
        fetchedAt: row.fetched_at ?? null,
        headerMediaId: row.header_media_id ?? null,
        headerMediaHash: row.header_media_hash ?? null,
        headerMediaPreviewUrl: row.header_media_preview_url ?? null,
        headerMediaPreviewExpiresAt: row.header_media_preview_expires_at ?? null,
        content: bodyText,
        preview: bodyText,
        lastUpdated: row.updated_at || row.created_at,
        components,
    }
}

export const templateDb = {
    getAll: async (): Promise<Template[]> => {
        const { data, error } = await supabase
            .from('templates')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data as TemplateRow[] || []).map(mapRowToTemplate)
    },

    getByName: async (name: string): Promise<Template | undefined> => {
        const { data, error } = await supabase
            .from('templates')
            .select('*')
            .eq('name', name)
            .single()

        if (error || !data) return undefined

        return mapRowToTemplate(data as TemplateRow)
    },

    upsert: async (
        input:
            | Template
            | Array<{
                name: string
                language?: string
                category?: string
                status?: string
                components?: unknown
                parameter_format?: 'positional' | 'named' | string
                spec_hash?: string | null
                fetched_at?: string | null
            }>
    ): Promise<void> => {
        const now = new Date().toISOString()

        // Batch upsert (rows already in DB column format)
        if (Array.isArray(input)) {
            const { error } = await supabase
                .from('templates')
                .upsert(
                    input.map(r => ({
                        name: r.name,
                        category: r.category,
                        language: r.language,
                        status: r.status,
                        parameter_format: r.parameter_format,
                        components: r.components,
                        spec_hash: r.spec_hash ?? null,
                        fetched_at: r.fetched_at ?? null,
                        updated_at: now,
                    })),
                    { onConflict: 'name,language' }
                )
            if (error) throw error
            return
        }

        // Single template upsert (App Template shape)
        const template = input

        const { error } = await supabase
            .from('templates')
            .upsert({
                id: template.id,
                name: template.name,
                category: template.category,
                language: template.language,
                status: template.status,
                parameter_format: template.parameterFormat || 'positional',
                components: template.content,
                spec_hash: template.specHash ?? null,
                fetched_at: template.fetchedAt ?? null,
                created_at: now,
                updated_at: now,
            }, { onConflict: 'name,language' })

        if (error) throw error
    },
}
