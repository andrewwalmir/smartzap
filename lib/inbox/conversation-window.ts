export const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getWindowExpiresAt(lastMessageAt: string | null): Date | null {
  const parsed = parseDate(lastMessageAt)
  if (!parsed) return null
  return new Date(parsed.getTime() + WINDOW_DURATION_MS)
}

export function isWindowOpen(lastMessageAt: string | null, now = new Date()): boolean {
  const expiresAt = getWindowExpiresAt(lastMessageAt)
  if (!expiresAt) return false
  return now.getTime() <= expiresAt.getTime()
}

export function getElapsedSinceLastMessageMs(lastMessageAt: string | null, now = new Date()): number | null {
  const parsed = parseDate(lastMessageAt)
  if (!parsed) return null
  return Math.max(0, now.getTime() - parsed.getTime())
}

export function formatDurationParts(durationMs: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000))
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  }
}

export function formatElapsedSinceLastMessage(lastMessageAt: string | null, now = new Date()): string | null {
  const elapsedMs = getElapsedSinceLastMessageMs(lastMessageAt, now)
  if (elapsedMs == null) return null
  const { hours, minutes } = formatDurationParts(elapsedMs)
  return `Ultima mensagem ha ${hours}h ${minutes}m`
}
