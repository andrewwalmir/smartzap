// @vitest-environment node

import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(),
  supabase: {},
}))

vi.mock('@/lib/verify-token', () => ({
  getVerifyToken: vi.fn(),
}))

vi.mock('@/lib/phone-formatter', () => ({
  normalizePhoneNumber: vi.fn((value: string) => value),
}))

vi.mock('@/lib/phone-suppressions', () => ({
  upsertPhoneSuppression: vi.fn(),
}))

vi.mock('@/lib/auto-suppression', () => ({
  maybeAutoSuppressByFailure: vi.fn(),
}))

vi.mock('@/lib/whatsapp-errors', () => ({
  mapWhatsAppError: vi.fn(),
  isCriticalError: vi.fn(),
  isOptOutError: vi.fn(),
  getUserFriendlyMessageForMetaError: vi.fn(),
  getRecommendedActionForMetaError: vi.fn(),
  normalizeMetaErrorTextForStorage: vi.fn(),
}))

vi.mock('@/lib/workflow-trace', () => ({
  emitWorkflowTrace: vi.fn(),
  maskPhone: vi.fn((value: string) => value),
}))

vi.mock('@/lib/whatsapp-status-events', () => ({
  applyStatusUpdateToCampaignContact: vi.fn(),
  enqueueWebhookStatusReconcileBestEffort: vi.fn(),
  markEventAttempt: vi.fn(),
  normalizeMetaStatus: vi.fn(),
  recordStatusEvent: vi.fn(),
  tryParseWebhookTimestampSeconds: vi.fn(),
}))

vi.mock('@/lib/whatsapp-webhook-dedupe', () => ({
  shouldProcessWhatsAppStatusEvent: vi.fn(),
}))

vi.mock('@/lib/whatsapp-credentials', () => ({
  getWhatsAppCredentials: vi.fn(),
}))

vi.mock('@/lib/flow-mapping', () => ({
  applyFlowMappingToContact: vi.fn(),
}))

vi.mock('@/lib/supabase-db', () => ({
  settingsDb: {
    get: vi.fn(),
  },
}))

vi.mock('@/lib/builder/workflow-db', () => ({
  ensureWorkflowRecord: vi.fn(),
  getCompanyId: vi.fn(),
}))

vi.mock('@/lib/builder/workflow-conversations', () => ({
  getPendingConversation: vi.fn(),
}))

vi.mock('@/lib/inbox/inbox-webhook', () => ({
  handleInboundMessage: vi.fn(),
  handleDeliveryStatus: vi.fn(),
}))

vi.mock('@/lib/app-url', () => ({
  getAppBaseUrl: vi.fn(),
}))

vi.mock('@upstash/workflow', () => ({
  Client: vi.fn(),
}))

describe('/api/webhook', () => {
  const env = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env = { ...env }
  })

  afterEach(() => {
    process.env = { ...env }
  })

  it('returns 400 when body is empty', async () => {
    const { POST } = await import('./route')
    const request = new NextRequest('http://localhost:3000/api/webhook', {
      method: 'POST',
      body: '',
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      status: 'ignored',
      error: 'Body inválido',
    })
  })

  it('returns 401 when signature is invalid', async () => {
    process.env.META_APP_SECRET = 'top-secret'

    const { POST } = await import('./route')
    const request = new NextRequest('http://localhost:3000/api/webhook', {
      method: 'POST',
      headers: {
        'X-Hub-Signature-256': 'sha256=invalid',
      },
      body: JSON.stringify({ object: 'whatsapp_business_account' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ status: 'unauthorized' })
  })

  it('returns 400 when body is not valid JSON', async () => {
    process.env.META_APP_SECRET = 'top-secret'

    const { POST } = await import('./route')
    const rawBody = '{"object":'
    const signature = `sha256=${createHmac('sha256', process.env.META_APP_SECRET).update(rawBody, 'utf8').digest('hex')}`
    const request = new NextRequest('http://localhost:3000/api/webhook', {
      method: 'POST',
      headers: {
        'X-Hub-Signature-256': signature,
      },
      body: rawBody,
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      status: 'ignored',
      error: 'Body inválido',
    })
  })

  it('returns 500 when supabase is not configured after a valid payload', async () => {
    process.env.META_APP_SECRET = 'top-secret'

    const { getSupabaseAdmin } = await import('@/lib/supabase')
    vi.mocked(getSupabaseAdmin).mockReturnValue(null)

    const { POST } = await import('./route')
    const rawBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
    const signature = `sha256=${createHmac('sha256', process.env.META_APP_SECRET).update(rawBody, 'utf8').digest('hex')}`
    const request = new NextRequest('http://localhost:3000/api/webhook', {
      method: 'POST',
      headers: {
        'X-Hub-Signature-256': signature,
      },
      body: rawBody,
    })

    const response = await POST(request)

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      status: 'error',
      error: 'Supabase not configured',
    })
  })

  it('verifies the challenge token on GET', async () => {
    const { getVerifyToken } = await import('@/lib/verify-token')
    vi.mocked(getVerifyToken).mockResolvedValue('verify-me')

    const { GET } = await import('./route')
    const request = new NextRequest(
      'http://localhost:3000/api/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc123',
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('abc123')
  })
})
