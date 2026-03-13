// @vitest-environment node

import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webhookFixtures } from '@/tests/fixtures/webhook-meta-payloads'

const mockGetSupabaseAdmin = vi.fn()
const mockSupabaseFrom = vi.fn()
const mockGetVerifyToken = vi.fn()
const mockSettingsDbGet = vi.fn()
const mockEnsureWorkflowRecord = vi.fn()
const mockGetCompanyId = vi.fn()
const mockGetPendingConversation = vi.fn()
const mockHandleInboundMessage = vi.fn()
const mockWorkflowTrigger = vi.fn()
const mockQStashPublish = vi.fn()
const mockFlowSubmissionUpsert = vi.fn()
const mockGetRedis = vi.fn()
const mockRateLimit = vi.fn()
const mockRateGetRemaining = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
  supabase: {
    from: mockSupabaseFrom,
  },
}))

vi.mock('@/lib/upstash/redis', () => ({
  getRedis: mockGetRedis,
}))

vi.mock('@/lib/verify-token', () => ({
  getVerifyToken: mockGetVerifyToken,
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
  applyStatusUpdateToCampaignContact: vi.fn().mockResolvedValue({
    reason: 'already_applied',
    traceId: null,
    campaignId: null,
    phone: null,
  }),
  enqueueWebhookStatusReconcileBestEffort: vi.fn(),
  markEventAttempt: vi.fn(),
  normalizeMetaStatus: vi.fn((status: string) => status),
  recordStatusEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  tryParseWebhookTimestampSeconds: vi.fn(() => ({ iso: '2026-03-12T18:00:00.000Z', raw: '1736382001' })),
}))

vi.mock('@/lib/whatsapp-webhook-dedupe', () => ({
  shouldProcessWhatsAppStatusEvent: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/whatsapp-credentials', () => ({
  getWhatsAppCredentials: vi.fn(),
}))

vi.mock('@/lib/flow-mapping', () => ({
  applyFlowMappingToContact: vi.fn(),
}))

vi.mock('@/lib/supabase-db', () => ({
  settingsDb: {
    get: mockSettingsDbGet,
  },
}))

vi.mock('@/lib/builder/workflow-db', () => ({
  ensureWorkflowRecord: mockEnsureWorkflowRecord,
  getCompanyId: mockGetCompanyId,
}))

vi.mock('@/lib/builder/workflow-conversations', () => ({
  getPendingConversation: mockGetPendingConversation,
}))

vi.mock('@/lib/inbox/inbox-webhook', () => ({
  handleInboundMessage: mockHandleInboundMessage,
  handleDeliveryStatus: vi.fn(),
}))

vi.mock('@/lib/app-url', () => ({
  getAppBaseUrl: vi.fn(() => 'https://hangarzap.example.com'),
  getAppBaseUrlOrNull: vi.fn(() => 'https://hangarzap.example.com'),
}))

vi.mock('@upstash/workflow', () => ({
  Client: vi.fn().mockImplementation(function MockWorkflowClient() {
    return { trigger: mockWorkflowTrigger } as any
  }),
}))

vi.mock('@upstash/qstash', () => ({
  Client: vi.fn().mockImplementation(function MockQStashClient() {
    return { publish: mockQStashPublish } as any
  }),
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class MockRatelimit {
    static slidingWindow = vi.fn(() => 'sliding-window')

    constructor() {}

    limit = mockRateLimit
    getRemaining = mockRateGetRemaining
  },
}))

describe('/api/webhook', () => {
  const env = { ...process.env }

  function createSignedRequest(body: string, headers?: HeadersInit) {
    const signature = `sha256=${createHmac('sha256', process.env.META_APP_SECRET || '').update(body, 'utf8').digest('hex')}`
    return new NextRequest('http://localhost:3000/api/webhook', {
      method: 'POST',
      headers: {
        'X-Hub-Signature-256': signature,
        ...(headers || {}),
      },
      body,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...env, META_APP_SECRET: 'top-secret' }

    mockGetSupabaseAdmin.mockReturnValue({})
    mockSettingsDbGet.mockResolvedValue(null)
    mockEnsureWorkflowRecord.mockResolvedValue(undefined)
    mockGetCompanyId.mockResolvedValue('company-1')
    mockGetPendingConversation.mockResolvedValue(null)
    mockHandleInboundMessage.mockResolvedValue({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      triggeredAI: false,
    })
    mockWorkflowTrigger.mockResolvedValue({ workflowRunId: 'run-1' })
    mockQStashPublish.mockResolvedValue({ messageId: 'qstash-msg-1' })
    mockGetRedis.mockReturnValue(null)
    mockRateLimit.mockResolvedValue({
      success: true,
      limit: 15,
      remaining: 14,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })
    mockRateGetRemaining.mockResolvedValue({
      limit: 15,
      remaining: 10,
      reset: Date.now() + 60_000,
    })
    mockGetVerifyToken.mockResolvedValue('verify-me')
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'workflow_versions') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
            }),
          }),
        }
      }

      if (table === 'flow_submissions') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: [], error: null }),
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
          upsert: mockFlowSubmissionUpsert,
        }
      }

      if (table === 'contacts' || table === 'flows') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: [], error: null }),
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }
      }

      return {
        update: () => ({
          eq: () => ({
            select: async () => ({ data: [], error: null }),
          }),
        }),
        select: () => ({
          eq: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
        rpc: async () => ({ error: null }),
      }
    })
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
  }, 15000)

  it('returns 401 when signature is invalid', async () => {
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
    await expect(response.json()).resolves.toMatchObject({ status: 'unauthorized', correlationId: expect.any(String) })
  })

  it('returns 429 before signature comparison when invalid-signature IP is already blocked', async () => {
    mockGetRedis.mockReturnValue({} as any)
    mockRateGetRemaining.mockResolvedValue({
      limit: 15,
      remaining: 0,
      reset: Date.now() + 60_000,
    })

    vi.resetModules()
    const { POST } = await import('./route')
    const request = new NextRequest('http://localhost:3000/api/webhook', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '203.0.113.10',
        'X-Hub-Signature-256': 'sha256=invalid',
      },
      body: JSON.stringify({ object: 'whatsapp_business_account' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({
      status: 'rate_limited',
      correlationId: expect.any(String),
    })
  })

  it('returns 400 when body is not valid JSON', async () => {
    const { POST } = await import('./route')
    const request = createSignedRequest('{"object":')

    const response = await POST(request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      status: 'ignored',
      error: 'Body inválido',
    })
  })

  it('returns 500 when supabase is not configured after a valid payload', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    vi.mocked(getSupabaseAdmin).mockReturnValue(null)

    const { POST } = await import('./route')
    const request = createSignedRequest(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }), {
      'x-smartzap-webhook-worker': '1',
    })

    const response = await POST(request)

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      status: 'error',
      error: 'Supabase not configured',
    })
  })

  describe('async ingress', () => {
    it('queues inbound text fixture and responds 200', async () => {
      process.env.QSTASH_TOKEN = 'qstash-token'
      process.env.VERCEL_URL = 'hangarzap.example.com'

      const { getSupabaseAdmin } = await import('@/lib/supabase')
      const supabaseSpy = vi.mocked(getSupabaseAdmin)

      const { POST } = await import('./route')
      const rawBody = JSON.stringify(webhookFixtures.inboundText)
      const request = createSignedRequest(rawBody)

      const response = await POST(request)

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        status: 'accepted',
        queued: true,
        correlationId: expect.any(String),
      })
      expect(mockQStashPublish).toHaveBeenCalledTimes(1)
      expect(mockQStashPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://hangarzap.example.com/api/webhook',
          body: rawBody,
          failureCallback: 'https://hangarzap.example.com/api/webhook/dlq',
          headers: expect.objectContaining({
            'X-Hub-Signature-256': expect.stringMatching(/^sha256=/),
            'x-smartzap-webhook-worker': '1',
            'x-correlation-id': expect.any(String),
          }),
        }),
      )
      expect(supabaseSpy).not.toHaveBeenCalled()
    })
  })

  describe('worker processing', () => {
    it('consumes inbound text fixture and triggers workflowClient.trigger()', async () => {
      process.env.QSTASH_TOKEN = 'qstash-token'
      mockSettingsDbGet.mockImplementation(async (key: string) =>
        key === 'workflow_builder_default_id' ? 'workflow-default' : null,
      )

      const { POST } = await import('./route')
      const rawBody = JSON.stringify(webhookFixtures.inboundText)
      const request = createSignedRequest(rawBody, { 'x-smartzap-webhook-worker': '1' })

      const response = await POST(request)

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ status: 'ok' })
      expect(mockHandleInboundMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          from: webhookFixtures.inboundText.entry[0].changes[0].value.messages[0].from,
          type: 'text',
          text: webhookFixtures.inboundText.entry[0].changes[0].value.messages[0].text.body,
        }),
      )
      expect(mockWorkflowTrigger).toHaveBeenCalledTimes(1)
      expect(mockWorkflowTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://hangarzap.example.com/api/builder/workflow/workflow-default/execute',
          workflowRunId: expect.stringContaining('wa_'),
          body: expect.objectContaining({
            workflowId: 'workflow-default',
            input: expect.objectContaining({
              from: webhookFixtures.inboundText.entry[0].changes[0].value.messages[0].from,
              to: webhookFixtures.inboundText.entry[0].changes[0].value.messages[0].from,
              message: webhookFixtures.inboundText.entry[0].changes[0].value.messages[0].text.body,
            }),
          }),
        }),
      )
    })

    it('returns 500 in worker mode when an infrastructure error escapes processing', async () => {
      mockGetPendingConversation.mockRejectedValueOnce(new Error('db unavailable'))

      const { POST } = await import('./route')
      const rawBody = JSON.stringify(webhookFixtures.inboundText)
      const request = createSignedRequest(rawBody, {
        'x-smartzap-webhook-worker': '1',
        'x-correlation-id': 'req-123',
      })

      const response = await POST(request)

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toMatchObject({
        status: 'error',
        error: 'db unavailable',
        correlationId: 'req-123',
      })
    })

    it('consumes button reply fixture and uses the button title as workflow input', async () => {
      process.env.QSTASH_TOKEN = 'qstash-token'
      mockSettingsDbGet.mockImplementation(async (key: string) =>
        key === 'workflow_builder_default_id' ? 'workflow-default' : null,
      )

      const { POST } = await import('./route')
      const rawBody = JSON.stringify(webhookFixtures.inboundButtonReply)
      const request = createSignedRequest(rawBody, { 'x-smartzap-webhook-worker': '1' })

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockWorkflowTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            input: expect.objectContaining({
              message: webhookFixtures.inboundButtonReply.entry[0].changes[0].value.messages[0].interactive.button_reply.title,
            }),
          }),
        }),
      )
    })

    it('consumes list reply fixture and uses the list title as workflow input', async () => {
      process.env.QSTASH_TOKEN = 'qstash-token'
      mockSettingsDbGet.mockImplementation(async (key: string) =>
        key === 'workflow_builder_default_id' ? 'workflow-default' : null,
      )

      const { POST } = await import('./route')
      const rawBody = JSON.stringify(webhookFixtures.inboundListReply)
      const request = createSignedRequest(rawBody, { 'x-smartzap-webhook-worker': '1' })

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockWorkflowTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            input: expect.objectContaining({
              message: webhookFixtures.inboundListReply.entry[0].changes[0].value.messages[0].interactive.list_reply.title,
            }),
          }),
        }),
      )
    })

    it('consumes flow reply fixture and persists response_json in flow_submissions', async () => {
      mockFlowSubmissionUpsert.mockResolvedValue({ error: null })

      const { POST } = await import('./route')
      const rawBody = JSON.stringify(webhookFixtures.inboundFlowReply)
      const request = createSignedRequest(rawBody, { 'x-smartzap-webhook-worker': '1' })

      const response = await POST(request)

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ status: 'ok' })
      expect(mockFlowSubmissionUpsert).toHaveBeenCalled()
      expect(mockFlowSubmissionUpsert.mock.calls[0]?.[0]).toMatchObject(
        expect.objectContaining({
          message_id: webhookFixtures.inboundFlowReply.entry[0].changes[0].value.messages[0].id,
          response_json_raw: webhookFixtures.inboundFlowReply.entry[0].changes[0].value.messages[0].interactive.nfm_reply.response_json,
          response_json: expect.objectContaining({
            flow_token: 'campaign_token_abc',
            selected_date: '2026-12-12',
            selected_service: 'Consultation',
          }),
        }),
      )
    })

    it('uses the same workflowRunId for duplicate inbound payloads', async () => {
      process.env.QSTASH_TOKEN = 'qstash-token'
      mockSettingsDbGet.mockImplementation(async (key: string) =>
        key === 'workflow_builder_default_id' ? 'workflow-default' : null,
      )

      const { POST } = await import('./route')
      const rawBody = JSON.stringify(webhookFixtures.inboundText)
      const firstRequest = createSignedRequest(rawBody, { 'x-smartzap-webhook-worker': '1' })
      const secondRequest = createSignedRequest(rawBody, { 'x-smartzap-webhook-worker': '1' })

      await POST(firstRequest)
      await POST(secondRequest)

      const firstCall = mockWorkflowTrigger.mock.calls[0]?.[0]
      const secondCall = mockWorkflowTrigger.mock.calls[1]?.[0]

      expect(firstCall?.workflowRunId).toBe(secondCall?.workflowRunId)
    })

    it('consumes status fixture without triggering workflow execution', async () => {
      const { POST } = await import('./route')
      const rawBody = JSON.stringify(webhookFixtures.statusDelivered)
      const request = createSignedRequest(rawBody, { 'x-smartzap-webhook-worker': '1' })

      const response = await POST(request)

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ status: 'ok' })
      expect(mockWorkflowTrigger).not.toHaveBeenCalled()
    })
  })

  it('verifies the challenge token on GET', async () => {
    const { GET } = await import('./route')
    const request = new NextRequest(
      'http://localhost:3000/api/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc123',
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('abc123')
  })
})
