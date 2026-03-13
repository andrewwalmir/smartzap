import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildInboxConversation } from '@/tests/helpers'
import { useConversationWindow } from './useConversationWindow'

describe('useConversationWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-12T18:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna janela fechada quando nao ha ultima mensagem', () => {
    const conversation = buildInboxConversation({ last_message_at: null })
    const { result } = renderHook(() => useConversationWindow(conversation))

    expect(result.current.windowOpen).toBe(false)
    expect(result.current.hasMessages).toBe(false)
  })

  it('recalcula a janela no polling de 60 segundos', () => {
    const conversation = buildInboxConversation({
      last_message_at: '2026-03-11T18:00:30.000Z',
    })

    const { result } = renderHook(() => useConversationWindow(conversation))
    expect(result.current.windowOpen).toBe(true)

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current.windowOpen).toBe(false)
  })

  it('recalcula ao trocar de conversa', () => {
    const oldConversation = buildInboxConversation({
      last_message_at: '2026-03-10T10:00:00.000Z', // 32h ago - closed
    })
    const newConversation = buildInboxConversation({
      last_message_at: '2026-03-12T17:00:00.000Z', // 1h ago - open
    })

    const { result, rerender } = renderHook(
      ({ conv }) => useConversationWindow(conv),
      { initialProps: { conv: oldConversation } },
    )

    expect(result.current.windowOpen).toBe(false)

    rerender({ conv: newConversation })

    expect(result.current.windowOpen).toBe(true)
  })

  it('retorna janela aberta quando mensagem e recente', () => {
    const conversation = buildInboxConversation({
      last_message_at: '2026-03-12T17:30:00.000Z', // 30min ago
    })
    const { result } = renderHook(() => useConversationWindow(conversation))

    expect(result.current.windowOpen).toBe(true)
    expect(result.current.hasMessages).toBe(true)
  })
})
