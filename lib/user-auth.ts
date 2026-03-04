/**
 * User Authentication System for Single-Tenant DaaS
 * 
 * Simple auth using MASTER_PASSWORD from environment variable
 * - No password hashing needed (password stored in Vercel env)
 * - httpOnly + Secure cookies for sessions
 * - Rate limiting for brute force protection
 * 
 * Usa Supabase (PostgreSQL) como banco de dados
 */

import { cookies } from 'next/headers'
import { supabase } from './supabase'
import { normalizePhoneNumber, validateAnyPhoneNumber } from './phone-formatter'

function getFirstName(fullName: string): string {
  const normalized = fullName.trim().replace(/\s+/gu, ' ')
  if (!normalized) return ''
  const [first] = normalized.split(' ')
  return first || normalized
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SESSION_COOKIE_NAME = 'smartzap_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days in seconds
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION = 15 * 60 * 1000 // 15 minutes

// Novo formato: mÃºltiplas sessÃµes simultÃ¢neas (evita invalidaÃ§Ã£o entre domÃ­nios/devices)
// Persistido em `settings.key = 'session_tokens'` como JSON.
type StoredSession = {
  tokenHash?: string
  legacyToken?: string
  createdAt: string
}

async function hashSessionToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`smartzap_session_v1:${token}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ============================================================================
// TYPES
// ============================================================================

export interface Company {
  id: string
  name: string
  email: string
  phone: string
  createdAt: string
}

export interface UserAuthResult {
  success: boolean
  error?: string
  company?: Company
}

// ============================================================================
// DATABASE HELPERS
// ============================================================================

/**
 * Upsert a setting in the database
 */
async function upsertSetting(key: string, value: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_at: now }, { onConflict: 'key' })

  if (error) {
    // NÃ£o silencie erros de permissÃ£o/RLS â€” isso causa loops e estados falsos.
    throw new Error(`Falha ao salvar setting "${key}": ${error.message}`)
  }
}

/**
 * Get a setting from the database
 */
async function getSetting(key: string): Promise<{ value: string; updated_at: string } | null> {
  const { data, error } = await supabase
    .from('settings')
    .select('value, updated_at')
    .eq('key', key)
    .single()

  if (error || !data) return null
  return data
}

/**
 * Delete a setting from the database
 */
async function deleteSetting(key: string): Promise<void> {
  const { error } = await supabase.from('settings').delete().eq('key', key)
  if (error) {
    throw new Error(`Falha ao remover setting "${key}": ${error.message}`)
  }
}

function parseStoredSessions(raw: string): StoredSession[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    const sessions: StoredSession[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const tokenHash = (item as any).tokenHash
      const token = (item as any).token
      const createdAt = (item as any).createdAt
      if (typeof createdAt !== 'string' || !createdAt) continue

      if (typeof tokenHash === 'string' && /^[a-f0-9]{64}$/i.test(tokenHash)) {
        sessions.push({ tokenHash: tokenHash.toLowerCase(), createdAt })
        continue
      }

      if (typeof token === 'string' && token.length >= 10) {
        sessions.push({ legacyToken: token, createdAt })
      }
    }
    return sessions
  } catch {
    return []
  }
}

function pruneExpiredSessions(sessions: StoredSession[], now: Date): StoredSession[] {
  const maxAgeMs = SESSION_MAX_AGE * 1000
  return sessions.filter(s => {
    const created = new Date(s.createdAt)
    if (Number.isNaN(created.getTime())) return false
    return now.getTime() - created.getTime() <= maxAgeMs
  })
}

async function getStoredSessions(): Promise<StoredSession[] | null> {
  const setting = await getSetting('session_tokens')
  if (!setting?.value) return null
  return parseStoredSessions(setting.value)
}

async function setStoredSessions(sessions: StoredSession[]): Promise<void> {
  const normalized: StoredSession[] = []
  for (const session of sessions) {
    if (typeof session.createdAt !== 'string' || !session.createdAt) continue

    if (session.tokenHash && /^[a-f0-9]{64}$/i.test(session.tokenHash)) {
      normalized.push({ tokenHash: session.tokenHash.toLowerCase(), createdAt: session.createdAt })
      continue
    }

    if (session.legacyToken && session.legacyToken.length >= 10) {
      const tokenHash = await hashSessionToken(session.legacyToken)
      normalized.push({ tokenHash, createdAt: session.createdAt })
    }
  }
  await upsertSetting('session_tokens', JSON.stringify(normalized))
}

/**
 * Check if setup is completed (company exists)
 */
export async function isSetupComplete(): Promise<boolean> {
  // Em produÃ§Ã£o, usamos a env var para evitar consultas e loops.
  if (process.env.SETUP_COMPLETE === 'true') return true

  // Em dev/local, o fluxo pode rodar sem Vercel.
  // EntÃ£o consideramos "setup completo" se a empresa jÃ¡ foi gravada no banco.
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .eq('key', 'company_name')
        .single()

      if (error) {
        // Ajuda a diagnosticar "isSetup:false" causado por permissÃ£o negada.
        console.warn('[isSetupComplete] settings/company_name query error:', error.message)
        return false
      }
      return !!data?.value
    } catch {
      return false
    }
  }

  return false
}

/**
 * Get company info
 */
export async function getCompany(): Promise<Company | null> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['company_id', 'company_name', 'company_email', 'company_phone', 'company_created_at'])

    if (error || !data || data.length === 0) return null

    const settings: Record<string, string> = {}
    data.forEach(row => {
      settings[row.key] = row.value
    })

    if (!settings.company_name) return null

    return {
      id: settings.company_id || 'default',
      name: settings.company_name,
      email: settings.company_email || '',
      phone: settings.company_phone || '',
      createdAt: settings.company_created_at || new Date().toISOString()
    }
  } catch {
    return null
  }
}

// ============================================================================
// SETUP (First-time configuration)
// ============================================================================

/**
 * Complete initial setup - create company, email, phone
 * Password is handled via MASTER_PASSWORD env var
 */
export async function completeSetup(
  companyName: string,
  companyAdmin: string,
  email: string,
  phone: string
): Promise<UserAuthResult> {
  // Validate inputs
  if (!companyName || companyName.trim().length < 2) {
    return { success: false, error: 'Nome da empresa deve ter pelo menos 2 caracteres' }
  }

  if (!companyAdmin || companyAdmin.trim().length < 2) {
    return { success: false, error: 'Nome do responsÃ¡vel deve ter pelo menos 2 caracteres' }
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'E-mail invÃ¡lido' }
  }

  // Normalize first so we accept inputs like "5511999999999" (without '+')
  const normalizedPhoneE164ForValidation = normalizePhoneNumber(phone)
  const phoneValidation = validateAnyPhoneNumber(normalizedPhoneE164ForValidation)
  if (!phoneValidation.isValid) {
    return { success: false, error: phoneValidation.error || 'Telefone invÃ¡lido' }
  }

  try {
    const now = new Date().toISOString()
    // Use existing company_id if available, otherwise create new
    const existingId = await getSetting('company_id')
    const companyId = existingId?.value || crypto.randomUUID()

    const normalizedPhoneE164 = normalizedPhoneE164ForValidation
    const storedPhoneDigits = normalizedPhoneE164.replace(/\D/g, '')

    // Save company info using parallel upserts
    await Promise.all([
      upsertSetting('company_id', companyId),
      upsertSetting('company_name', companyName.trim()),
      upsertSetting('company_admin', companyAdmin.trim()),
      upsertSetting('company_email', email.trim().toLowerCase()),
      upsertSetting('company_phone', storedPhoneDigits),
      upsertSetting('company_created_at', now)
    ])

    // Seed automÃ¡tico do "Contato de Teste" (Settings â†’ Testes)
    // SÃ³ cria se ainda nÃ£o existir, para nÃ£o sobrescrever a escolha do usuÃ¡rio.
    try {
      const existingTestContact = await getSetting('test_contact')
      const adminFullName = companyAdmin.trim()
      const adminFirstName = getFirstName(adminFullName)
      const desiredName = adminFirstName || adminFullName

      if (!existingTestContact?.value) {
        await upsertSetting(
          'test_contact',
          JSON.stringify({
            name: desiredName,
            phone: normalizedPhoneE164,
            updatedAt: now,
          })
        )
      } else {
        // Se o contato jÃ¡ existe mas parece ter sido seedado automaticamente com o nome completo,
        // podemos ajustar para o primeiro nome sem sobrescrever personalizaÃ§Ãµes.
        try {
          const parsed = JSON.parse(existingTestContact.value) as unknown
          if (parsed && typeof parsed === 'object') {
            const tc = parsed as { name?: unknown; phone?: unknown; updatedAt?: unknown }
            const currentName = typeof tc.name === 'string' ? tc.name.trim() : ''
            const currentPhoneRaw = typeof tc.phone === 'string' ? tc.phone.trim() : ''
            const currentPhoneDigits = currentPhoneRaw.replace(/\D/g, '')
            const shouldUpgradePhoneToE164 = !!currentPhoneRaw && !currentPhoneRaw.startsWith('+')

            // Upgrade seguro de seeds antigos:
            // - Se o nome Ã© o nome completo do admin (seed antigo) e o telefone bate (por dÃ­gitos),
            //   atualiza para primeiro nome e telefone em E.164.
            if (currentName === adminFullName && currentPhoneDigits === storedPhoneDigits) {
              await upsertSetting(
                'test_contact',
                JSON.stringify({
                  ...tc,
                  name: desiredName,
                  phone: normalizedPhoneE164,
                  updatedAt: now,
                })
              )
            } else if (shouldUpgradePhoneToE164 && currentPhoneDigits === storedPhoneDigits) {
              // Se o usuÃ¡rio nÃ£o personalizou o nome mas o telefone estÃ¡ sem '+',
              // apenas normaliza para E.164.
              await upsertSetting(
                'test_contact',
                JSON.stringify({
                  ...tc,
                  phone: normalizedPhoneE164,
                  updatedAt: now,
                })
              )
            }
          }
        } catch {
          // Se nÃ£o for JSON vÃ¡lido, nÃ£o mexe.
        }
      }
    } catch (err) {
      // NÃ£o bloqueia o setup inteiro se apenas o seed do contato de teste falhar.
      console.warn('[completeSetup] Falha ao criar test_contact automaticamente:', err)
    }

    // Create session after setup
    await createSession()

    return {
      success: true,
      company: {
        id: companyId,
        name: companyName.trim(),
        email: email.trim().toLowerCase(),
        phone: storedPhoneDigits,
        createdAt: now
      }
    }
  } catch (error) {
    console.error('Setup error:', error)
    return { success: false, error: 'Erro ao salvar configuraÃ§Ã£o' }
  }
}

// ============================================================================
// LOGIN / LOGOUT
// ============================================================================

/**
 * Hash SHA-256 com salt fixo (mesmo algoritmo do IdentityStep no wizard).
 */
async function hashPasswordForLogin(password: string): Promise<string> {
  const SALT = '_smartzap_salt_2026';
  const encoder = new TextEncoder();
  const data = encoder.encode(password + SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifica se uma string parece ser um hash SHA-256 (64 caracteres hexadecimais)
 */
function isHashFormat(value: string): boolean {
  return value.length === 64 && /^[a-f0-9]+$/i.test(value)
}

/**
 * Attempt login with password
 * Validates against MASTER_PASSWORD env var
 *
 * Aceita dois formatos de MASTER_PASSWORD:
 * - Hash SHA-256 (64 chars hex): compara com hash da senha digitada (retrocompatÃ­vel)
 * - Texto puro: compara diretamente (mais simples para reset)
 */
export async function loginUser(password: string): Promise<UserAuthResult> {
  if (!password) {
    return { success: false, error: 'Senha Ã© obrigatÃ³ria' }
  }

  // Check if MASTER_PASSWORD is configured
  const masterPassword = process.env.MASTER_PASSWORD
  if (!masterPassword) {
    return { success: false, error: 'MASTER_PASSWORD nÃ£o configurada nas variÃ¡veis de ambiente' }
  }

  // Check rate limiting
  const isLocked = await checkRateLimiting()
  if (isLocked) {
    return { success: false, error: 'Muitas tentativas. Tente novamente em 15 minutos.' }
  }

  try {
    // Detecta automaticamente se MASTER_PASSWORD Ã© hash ou texto puro
    const masterIsHash = isHashFormat(masterPassword)

    let isValid: boolean
    if (masterIsHash) {
      // Comportamento original: MASTER_PASSWORD Ã© hash, compara com hash da senha digitada
      const passwordHash = await hashPasswordForLogin(password)
      isValid = passwordHash === masterPassword
    } else {
      // Novo: MASTER_PASSWORD Ã© texto puro, compara diretamente
      isValid = password === masterPassword
    }

    if (!isValid) {
      await recordFailedAttempt()
      return { success: false, error: 'Senha incorreta' }
    }

    // Clear failed attempts on success
    await clearFailedAttempts()

    // Create session
    await createSession()

    const company = await getCompany()
    return { success: true, company: company || undefined }

  } catch (error) {
    console.error('Login error:', error)
    return { success: false, error: 'Erro ao fazer login' }
  }
}

/**
 * Logout - destroy session
 */
export async function logoutUser(): Promise<void> {
  const cookieStore = await cookies()

  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value
  cookieStore.delete(SESSION_COOKIE_NAME)

  // Best-effort: remove o token atual da lista de sessÃµes para revogar imediatamente.
  if (sessionToken) {
    try {
      const now = new Date()
      const stored = await getStoredSessions()
      if (stored) {
        const pruned = pruneExpiredSessions(stored, now)
        const sessionTokenHash = await hashSessionToken(sessionToken)
        const filtered = pruned.filter(
          s => s.tokenHash !== sessionTokenHash && s.legacyToken !== sessionToken
        )
        // SÃ³ grava se houver mudanÃ§a.
        if (filtered.length !== pruned.length) {
          await setStoredSessions(filtered.slice(-50))
        }
      }
    } catch {
      // NÃ£o bloqueia logout
    }
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Create a new session
 */
async function createSession(): Promise<void> {
  const cookieStore = await cookies()
  const sessionToken = crypto.randomUUID()
  const sessionTokenHash = await hashSessionToken(sessionToken)

  const nowIso = new Date().toISOString()

  // Store session in database (multi-session)
  // MantÃ©m mÃºltiplos tokens ativos para evitar invalidaÃ§Ã£o entre domÃ­nios/devices.
  const existing = await getStoredSessions()
  const now = new Date()
  const pruned = pruneExpiredSessions(existing || [], now)
  const nextSessions = [...pruned, { tokenHash: sessionTokenHash, createdAt: nowIso }].slice(-50)
  await Promise.all([
    setStoredSessions(nextSessions),
    upsertSetting('session_token_hash', sessionTokenHash),
  ])

  // Best-effort: remove token legado em texto puro.
  try {
    await deleteSetting('session_token')
  } catch {
    // ignore
  }

  // Set cookie
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/'
  })
}

/**
 * Validate current session
 */
export async function validateSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (!sessionToken) return false

    const now = new Date()
    const sessionTokenHash = await hashSessionToken(sessionToken)

    // Prefer multi-session list when available
    const storedSessions = await getStoredSessions()
    if (storedSessions) {
      const pruned = pruneExpiredSessions(storedSessions, now)
      const found = pruned.some(
        s => s.tokenHash === sessionTokenHash || s.legacyToken === sessionToken
      )

      // Best-effort: se havia sessÃµes expiradas, compacta a lista.
      const needsNormalization = pruned.some(s => !s.tokenHash || !!s.legacyToken)
      if (pruned.length !== storedSessions.length || needsNormalization) {
        try {
          await setStoredSessions(pruned.slice(-50))
        } catch {
          // ignore
        }
      }

      if (!found) return false
      return true
    }

    // Legacy fallback: single hash token
    const hashSetting = await getSetting('session_token_hash')
    if (hashSetting?.value && hashSetting.value === sessionTokenHash) {
      return true
    }

    // Legacy fallback: single token
    const setting = await getSetting('session_token')
    if (!setting) return false

    const storedToken = setting.value
    const updatedAt = new Date(setting.updated_at)

    // Check if session is expired
    const sessionAge = (now.getTime() - updatedAt.getTime()) / 1000
    if (!Number.isNaN(sessionAge) && sessionAge > SESSION_MAX_AGE) {
      await logoutUser()
      return false
    }

    if (sessionToken !== storedToken) return false

    // Migra token legado para hash.
    try {
      await upsertSetting('session_token_hash', sessionTokenHash)
      await deleteSetting('session_token')
    } catch {
      // ignore
    }

    return true
  } catch {
    return false
  }
}

/**
 * Get auth status for client
 * OPTIMIZED: Parallelized queries for better performance
 */
export async function getUserAuthStatus(): Promise<{
  isSetup: boolean
  isAuthenticated: boolean
  company: Company | null
}> {
  // Run in parallel for better performance
  const [isSetup, isAuthenticated] = await Promise.all([
    isSetupComplete(),
    validateSession()
  ])

  // Only fetch company if authenticated 
  const company = isAuthenticated ? await getCompany() : null

  return { isSetup, isAuthenticated, company }
}

// ============================================================================
// RATE LIMITING (Brute Force Protection)
// ============================================================================

async function checkRateLimiting(): Promise<boolean> {
  try {
    const setting = await getSetting('login_attempts')
    if (!setting) return false

    const attempts = parseInt(setting.value) || 0
    const lastAttempt = new Date(setting.updated_at)
    const now = new Date()

    // Reset if lockout period passed
    if (now.getTime() - lastAttempt.getTime() > LOCKOUT_DURATION) {
      await clearFailedAttempts()
      return false
    }

    return attempts >= MAX_LOGIN_ATTEMPTS
  } catch {
    return false
  }
}

async function recordFailedAttempt(): Promise<void> {
  // Get current count
  const setting = await getSetting('login_attempts')
  const currentAttempts = setting ? parseInt(setting.value) || 0 : 0

  await upsertSetting('login_attempts', (currentAttempts + 1).toString())
}

async function clearFailedAttempts(): Promise<void> {
  try {
    await deleteSetting('login_attempts')
  } catch (error) {
    console.warn('[auth] Falha ao limpar login_attempts (best-effort):', error)
  }
}

// ============================================================================
// PASSWORD INFO
// ============================================================================

/**
 * Password is managed via MASTER_PASSWORD environment variable in Vercel.
 *
 * ACEITA DOIS FORMATOS:
 * - Texto puro: "minhaSenha123" (recomendado - mais simples)
 * - Hash SHA-256: 64 caracteres hex (retrocompatÃ­vel com instalaÃ§Ãµes antigas)
 *
 * COMO RESETAR A SENHA:
 * 1. VÃ¡ em Vercel Dashboard â†’ Settings â†’ Environment Variables
 * 2. Edite MASTER_PASSWORD e coloque sua nova senha (ex: "novaSenha456")
 * 3. Clique em Save
 * 4. VÃ¡ em Deployments â†’ clique nos 3 pontos do Ãºltimo deploy â†’ Redeploy
 * 5. Pronto! FaÃ§a login com a nova senha
 */

