import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

import { FLOW_TEMPLATES } from '@/lib/flow-templates'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export async function GET(request: NextRequest) {
  const auth = await requireSessionOrApiKey(request)
  if (auth) return auth

  return NextResponse.json(
    FLOW_TEMPLATES.map((t) => ({
      key: t.key,
      name: t.name,
      description: t.description,
      flowJson: t.flowJson,
      defaultMapping: t.defaultMapping,
      isDynamic: t.isDynamic ?? false,
    })),
    {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  )
}
