/**
 * Resolução centralizada da base URL do app.
 *
 * Prioridade:
 *   1. NEXT_PUBLIC_APP_URL  — domínio customizado explícito (ex: https://zap.hangar39.com.br)
 *   2. VERCEL_PROJECT_PRODUCTION_URL — domínio de produção auto-detectado pela Vercel
 *   3. VERCEL_URL — URL do deploy atual (preview ou production)
 *   4. Fallback (localhost)
 *
 * @module lib/app-url
 */

const LOCALHOST_FALLBACK = 'http://localhost:3000'

/**
 * Retorna a base URL do app (sem trailing slash).
 *
 * @example
 * ```ts
 * getAppBaseUrl()
 * // 'https://zap.hangar39.com.br'
 * ```
 */
export function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/+$/, '')
  }

  const vercelEnv = process.env.VERCEL_ENV || null

  if (vercelEnv === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.trim()}`
  }

  return LOCALHOST_FALLBACK
}

/**
 * Retorna a base URL do app, ou null se nenhuma variável estiver configurada
 * (sem fallback para localhost). Útil para guards onde localhost não faz sentido.
 *
 * @example
 * ```ts
 * const base = getAppBaseUrlOrNull()
 * if (!base) return // não enfilera job
 * ```
 */
export function getAppBaseUrlOrNull(): string | null {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/+$/, '')
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
  }

  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim()}`
  }

  return null
}

/**
 * Retorna a webhook URL completa do app (/api/webhook).
 */
export function getAppWebhookUrl(): string {
  return `${getAppBaseUrl()}/api/webhook`
}
