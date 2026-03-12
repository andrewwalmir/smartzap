// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}))

import { applyStatusUpdateToCampaignContact } from './whatsapp-status-events'

describe('applyStatusUpdateToCampaignContact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ error: null })
  })

  it('does not downgrade read back to delivered', async () => {
    const updateSelect = vi.fn()

    mockFrom.mockImplementation((table: string) => {
      if (table !== 'campaign_contacts') throw new Error(`Unexpected table ${table}`)

      return {
        select: () => ({
          eq: () => ({
            limit: async () => ({
              data: [
                {
                  id: 'cc-1',
                  status: 'read',
                  campaign_id: 'campaign-1',
                  phone: '+5511988888888',
                  trace_id: 'trace-1',
                  delivered_at: '2026-03-12T18:00:00.000Z',
                },
              ],
              error: null,
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            neq: () => ({
              neq: () => ({
                select: updateSelect,
              }),
            }),
          }),
        }),
      }
    })

    const result = await applyStatusUpdateToCampaignContact({
      messageId: 'wamid-1',
      status: 'delivered',
      eventTsIso: '2026-03-12T18:05:00.000Z',
    })

    expect(result.reason).toBe('noop')
    expect(updateSelect).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('applies delivered when current status is sent', async () => {
    const updateSelect = vi.fn().mockResolvedValue({
      data: [{ id: 'cc-1' }],
      error: null,
    })

    mockFrom.mockImplementation((table: string) => {
      if (table !== 'campaign_contacts') throw new Error(`Unexpected table ${table}`)

      return {
        select: () => ({
          eq: () => ({
            limit: async () => ({
              data: [
                {
                  id: 'cc-1',
                  status: 'sent',
                  campaign_id: 'campaign-1',
                  phone: '+5511988888888',
                  trace_id: 'trace-1',
                  delivered_at: null,
                },
              ],
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (field: string, value: string) => ({
            neq: (field2: string, value2: string) => ({
              neq: (field3: string, value3: string) => {
                expect(field).toBe('message_id')
                expect(value).toBe('wamid-1')
                expect(field2).toBe('status')
                expect(value2).toBe('delivered')
                expect(field3).toBe('status')
                expect(value3).toBe('read')
                expect(patch).toMatchObject({
                  status: 'delivered',
                  delivered_at: '2026-03-12T18:05:00.000Z',
                })
                return {
                  select: updateSelect,
                }
              },
            }),
          }),
        }),
      }
    })

    const result = await applyStatusUpdateToCampaignContact({
      messageId: 'wamid-1',
      status: 'delivered',
      eventTsIso: '2026-03-12T18:05:00.000Z',
    })

    expect(result.reason).toBe('applied')
    expect(mockRpc).toHaveBeenCalledWith('increment_campaign_stat', {
      campaign_id_input: 'campaign-1',
      field: 'delivered',
    })
  })

  it('promotes delivered to read and preserves delivered count semantics', async () => {
    const markReadSelect = vi.fn().mockResolvedValue({
      data: [{ id: 'cc-1' }],
      error: null,
    })
    const ensureDeliveredAtSelect = vi.fn().mockResolvedValue({
      data: [{ id: 'cc-1' }],
      error: null,
    })

    mockFrom.mockImplementation((table: string) => {
      if (table !== 'campaign_contacts') throw new Error(`Unexpected table ${table}`)

      return {
        select: () => ({
          eq: () => ({
            limit: async () => ({
              data: [
                {
                  id: 'cc-1',
                  status: 'delivered',
                  campaign_id: 'campaign-1',
                  phone: '+5511988888888',
                  trace_id: 'trace-1',
                  delivered_at: null,
                },
              ],
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => {
            if (patch.status === 'read') {
              return {
                neq: () => ({
                  select: markReadSelect,
                }),
              }
            }

            if (patch.delivered_at) {
              return {
                is: () => ({
                  select: ensureDeliveredAtSelect,
                }),
              }
            }

            throw new Error(`Unexpected patch ${JSON.stringify(patch)}`)
          },
        }),
      }
    })

    const result = await applyStatusUpdateToCampaignContact({
      messageId: 'wamid-1',
      status: 'read',
      eventTsIso: '2026-03-12T18:05:00.000Z',
    })

    expect(result.reason).toBe('applied')
    expect(mockRpc).toHaveBeenCalledWith('increment_campaign_stat', {
      campaign_id_input: 'campaign-1',
      field: 'delivered',
    })
    expect(mockRpc).toHaveBeenCalledWith('increment_campaign_stat', {
      campaign_id_input: 'campaign-1',
      field: 'read',
    })
  })
})
