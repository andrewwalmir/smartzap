/**
 * Supabase Database Service
 * 
 * Camada de acesso ao banco (Supabase)
 */

import { supabase } from './supabase'
import { redis } from './redis'
import {
    Campaign,
    Contact,
    CampaignStatus,
    ContactStatus,
    LeadForm,
    CreateLeadFormDTO,
    UpdateLeadFormDTO,
    Template,
    TemplateComponent,
    TemplateCategory,
    TemplateStatus,
    AppSettings,
    TemplateProject,
    TemplateProjectItem,
    CreateTemplateProjectDTO,
    CustomFieldDefinition,
    CampaignFolder,
    CampaignTag,
    CreateCampaignFolderDTO,
    UpdateCampaignFolderDTO,
    CreateCampaignTagDTO,
} from '../types'
import { isSuppressionActive } from '@/lib/phone-suppressions'
import { canonicalTemplateCategory } from '@/lib/template-category'
import { normalizePhoneNumber, validatePhoneNumber } from '@/lib/phone-formatter'

// Divide array em chunks de tamanho n para evitar 414 Request-URI Too Large
// no PostgREST: .in('field', array) serializa todos os valores na URL.
function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size))
    }
    return chunks
}

/**
 * Normaliza tags que podem estar aninhadas como [["tag"]] → ["tag"].
 * Resolve corrupção de dados onde arrays JSONB foram double-wrapped.
 */
function flattenTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return []
    return tags
        .flat(Infinity)
        .map(t => {
            const s = String(t ?? '').trim()
            // Remove brackets de strings que parecem JSON arrays: '["tag"]' → 'tag'
            if (s.startsWith('[') && s.endsWith(']')) {
                try {
                    const parsed = JSON.parse(s)
                    if (Array.isArray(parsed)) return parsed.map(String)
                } catch { /* not JSON, keep as-is */ }
            }
            return s
        })
        .flat()
        .filter(Boolean)
}

import { nanoid } from 'nanoid'

// Gera um ID compatível com ambientes que usam UUID (preferencial) e também funciona como TEXT.
// - Em Supabase, muitos schemas antigos usam `uuid` como PK.
// - No schema consolidado atual, os PKs são TEXT com defaults, mas aceitar UUID como string é ok.
const generateId = () => {
    try {
        // Web Crypto (browser/edge) e Node moderno
        if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
    } catch {
        // ignore
    }

    // Fallback robusto
    return nanoid()
}

const generateWebhookToken = () => {
    // Token opaco para uso em integrações/webhooks (não é senha de usuário).
    // Mantemos simples e disponível em runtimes edge/node.
    try {
        if (typeof globalThis.crypto?.randomUUID === 'function') {
            return `lfw_${globalThis.crypto.randomUUID().replace(/-/g, '')}`
        }
    } catch {
        // ignore
    }

    return `lfw_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

// ============================================================================
// CAMPAIGNS
// ============================================================================

export { campaignDb } from './db/campaign-db'

// ============================================================================
// CONTACTS
// ============================================================================

export { contactDb } from './db/contact-db'

// ============================================================================
// LEAD FORMS (Captação de contatos)
// ============================================================================

export { leadFormDb } from './db/lead-form-db'

// ============================================================================
// CAMPAIGN CONTACTS (Junction Table)
// ============================================================================

export { campaignContactDb } from './db/campaign-contact-db'

// ============================================================================
// TEMPLATES
// ============================================================================

export { templateDb } from './db/template-db'

// ============================================================================
// CUSTOM FIELD DEFINITIONS
// ============================================================================

export { customFieldDefDb } from './db/custom-field-def-db'

// ============================================================================
// SETTINGS
// ============================================================================

export { settingsDb } from './db/settings-db'

// ============================================================================
// DASHBOARD
// ============================================================================

export { dashboardDb } from './db/dashboard-db'

// ============================================================================
// TEMPLATE PROJECTS (Factory)
// ============================================================================

export { templateProjectDb } from './db/template-project-db'

// ============================================================================
// CAMPAIGN FOLDERS
// ============================================================================

export { campaignFolderDb } from './db/campaign-folder-db'

// ============================================================================
// CAMPAIGN TAGS
// ============================================================================

export { campaignTagDb } from './db/campaign-tag-db'
