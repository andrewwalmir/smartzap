import { describe, expect, it } from 'vitest'
import {
  WINDOW_DURATION_MS,
  formatElapsedSinceLastMessage,
  getWindowExpiresAt,
  isWindowOpen,
} from './conversation-window'

describe('conversation-window', () => {
  const now = new Date('2026-03-12T18:00:00.000Z')

  it('detecta janela aberta quando a ultima mensagem tem menos de 24h', () => {
    const lastMessageAt = new Date(now.getTime() - WINDOW_DURATION_MS + 60_000).toISOString()
    expect(isWindowOpen(lastMessageAt, now)).toBe(true)
  })

  it('detecta janela aberta exatamente no limite de 24h', () => {
    const lastMessageAt = new Date(now.getTime() - WINDOW_DURATION_MS).toISOString()
    expect(isWindowOpen(lastMessageAt, now)).toBe(true)
  })

  it('detecta janela fechada quando passou de 24h', () => {
    const lastMessageAt = new Date(now.getTime() - WINDOW_DURATION_MS - 1).toISOString()
    expect(isWindowOpen(lastMessageAt, now)).toBe(false)
  })

  it('trata null como janela fechada', () => {
    expect(isWindowOpen(null, now)).toBe(false)
    expect(getWindowExpiresAt(null)).toBeNull()
  })

  it('calcula expiracao da janela', () => {
    const lastMessageAt = '2026-03-12T10:00:00.000Z'
    expect(getWindowExpiresAt(lastMessageAt)?.toISOString()).toBe('2026-03-13T10:00:00.000Z')
  })

  it('formata o tempo desde a ultima mensagem', () => {
    const lastMessageAt = '2026-03-12T15:35:00.000Z'
    expect(formatElapsedSinceLastMessage(lastMessageAt, now)).toBe('Ultima mensagem ha 2h 25m')
  })
})
