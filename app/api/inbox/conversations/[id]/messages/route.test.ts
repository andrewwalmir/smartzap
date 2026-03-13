// @vitest-environment node

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetConversation = vi.fn()
const mockListMessages = vi.fn()
const mockSendMessage = vi.fn()

vi.mock('@/lib/inbox/inbox-service', () => ({
  getConversation: (...args: unknown[]) => mockGetConversation(...args),
  listMessages: (...args: unknown[]) => mockListMessages(...args),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}))

describe('POST /api/inbox/conversations/[id]/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejeita texto quando a janela de 24h expirou', async () => {
    mockGetConversation.mockResolvedValue({
      id: 'conv-1',
      last_message_at: '2026-03-11T10:00:00.000Z',
    })

    const { POST } = await import('./route')
    const request = new NextRequest('http://localhost/api/inbox/conversations/conv-1/messages', {
      method: 'POST',
      body: JSON.stringify({ content: 'Olá', message_type: 'text' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request, { params: Promise.resolve({ id: 'conv-1' }) })

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('Janela de 24h expirou'),
    })
    expect(mockSendMessage).not.toHaveBeenCalled()
  }, 15000)

  it('permite template mesmo com a janela fechada', async () => {
    mockSendMessage.mockResolvedValue({ id: 'msg-1' })

    const { POST } = await import('./route')
    const request = new NextRequest('http://localhost/api/inbox/conversations/conv-1/messages', {
      method: 'POST',
      body: JSON.stringify({
        content: '📋 *Template: reabertura*',
        message_type: 'template',
        template_name: 'reabertura',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request, { params: Promise.resolve({ id: 'conv-1' }) })

    expect(response.status).toBe(201)
    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-1',
      '📋 *Template: reabertura*',
      'template',
      'reabertura',
      undefined,
      undefined,
    )
  })
})
