export const APP_BRAND_SLUG = 'hangarzap'
export const LEGACY_APP_BRAND_SLUG = 'smartzap'

export const SESSION_COOKIE_NAME = `${APP_BRAND_SLUG}_session`
export const LEGACY_SESSION_COOKIE_NAME = `${LEGACY_APP_BRAND_SLUG}_session`
export const SESSION_COOKIE_CANDIDATES = [SESSION_COOKIE_NAME, LEGACY_SESSION_COOKIE_NAME] as const

export const LIMITS_STORAGE_KEY = `${APP_BRAND_SLUG}_account_limits`
export const LEGACY_LIMITS_STORAGE_KEY = `${LEGACY_APP_BRAND_SLUG}_account_limits`

export const INSTALL_STATE_STORAGE_KEY = `${APP_BRAND_SLUG}_install_state`
export const LEGACY_INSTALL_STATE_STORAGE_KEY = `${LEGACY_APP_BRAND_SLUG}_install_state`

export const STORAGE_KEYS = {
  CAMPAIGNS: `${APP_BRAND_SLUG}_campaigns`,
  CONTACTS: `${APP_BRAND_SLUG}_contacts`,
  SETTINGS: `${APP_BRAND_SLUG}_settings`,
  TEMPLATES: `${APP_BRAND_SLUG}_templates`,
} as const

export const LEGACY_STORAGE_KEYS = {
  CAMPAIGNS: `${LEGACY_APP_BRAND_SLUG}_campaigns`,
  CONTACTS: `${LEGACY_APP_BRAND_SLUG}_contacts`,
  SETTINGS: `${LEGACY_APP_BRAND_SLUG}_settings`,
  TEMPLATES: `${LEGACY_APP_BRAND_SLUG}_templates`,
} as const

export const FLOW_TOKEN_PREFIX = `${APP_BRAND_SLUG}:`
export const LEGACY_FLOW_TOKEN_PREFIX = `${LEGACY_APP_BRAND_SLUG}:`
export const FLOW_TOKEN_PREFIX_CANDIDATES = [FLOW_TOKEN_PREFIX, LEGACY_FLOW_TOKEN_PREFIX] as const

type CookieReader = {
  get(name: string): { value?: string } | undefined
}

export function getSessionCookieValue(cookieStore: CookieReader): string | null {
  for (const cookieName of SESSION_COOKIE_CANDIDATES) {
    const value = cookieStore.get(cookieName)?.value
    if (value) return value
  }
  return null
}

export function clearSessionCookies(cookieStore: { delete(name: string): void }): void {
  for (const cookieName of SESSION_COOKIE_CANDIDATES) {
    cookieStore.delete(cookieName)
  }
}

export function hasSessionCookieHeader(cookieHeader: string): boolean {
  return SESSION_COOKIE_CANDIDATES.some((cookieName) => cookieHeader.includes(`${cookieName}=`))
}

export function getLocalStorageItem(primaryKey: string, legacyKeys: string[] = []): string | null {
  const primaryValue = localStorage.getItem(primaryKey)
  if (primaryValue !== null) return primaryValue

  for (const legacyKey of legacyKeys) {
    const legacyValue = localStorage.getItem(legacyKey)
    if (legacyValue !== null) return legacyValue
  }

  return null
}

export function setLocalStorageItem(primaryKey: string, value: string, legacyKeys: string[] = []): void {
  localStorage.setItem(primaryKey, value)
  for (const legacyKey of legacyKeys) {
    if (legacyKey !== primaryKey) localStorage.removeItem(legacyKey)
  }
}

export function removeLocalStorageItem(primaryKey: string, legacyKeys: string[] = []): void {
  localStorage.removeItem(primaryKey)
  for (const legacyKey of legacyKeys) {
    if (legacyKey !== primaryKey) localStorage.removeItem(legacyKey)
  }
}

export function generateFlowToken(flowId?: string, suffix = ''): string {
  const seed = Math.random().toString(36).slice(2, 8)
  const stamp = Date.now().toString(36)
  return `${FLOW_TOKEN_PREFIX}${flowId || 'flow'}:${stamp}:${seed}${suffix}`
}

export function appendCampaignToFlowToken(token: string, campaignId?: string): string {
  if (!campaignId) return token
  if (token.includes(':c:')) return token
  if (!FLOW_TOKEN_PREFIX_CANDIDATES.some((prefix) => token.startsWith(prefix))) return token
  return `${token}:c:${campaignId}`
}

export function extractMetaFlowIdFromFlowToken(flowToken?: string | null): string | null {
  const raw = String(flowToken || '').trim()
  if (!raw) return null

  for (const prefix of FLOW_TOKEN_PREFIX_CANDIDATES) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = raw.match(new RegExp(`^${escapedPrefix}(\\d{6,25}):`))
    if (match?.[1]) return match[1]
  }

  return null
}
