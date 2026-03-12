import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const correlationId = String(request.headers.get('x-correlation-id') || '').trim() || 'unknown'
  const body = await request.text().catch(() => '')

  console.error(`[REQ-${correlationId}] Webhook worker moved to DLQ/failure-callback`, body)

  return NextResponse.json({ status: 'ok', correlationId })
}
