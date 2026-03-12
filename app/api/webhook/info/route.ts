import { NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'

import { getVerifyToken } from '@/lib/verify-token'
import { getAppWebhookUrl } from '@/lib/app-url'

export async function GET() {
  const webhookUrl = getAppWebhookUrl()

  const webhookToken = await getVerifyToken()

  // Stats are now tracked in Supabase (campaign_contacts table)
  // (Sem stats via cache)

  return NextResponse.json({
    webhookUrl,
    webhookToken,
    stats: null, // Stats removed - use campaign details page instead
    debug: {
      vercelEnv: process.env.VERCEL_ENV || null,
      vercelUrl: process.env.VERCEL_URL || null,
      vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL || null,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
      env: {
        hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        hasSupabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
        hasSupabaseSecretKey: Boolean(process.env.SUPABASE_SECRET_KEY),
        hasQstashToken: Boolean(process.env.QSTASH_TOKEN),
        hasAuthSecret: Boolean(process.env.AUTH_SECRET),
      },
      gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF || null,
      gitCommitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    },
  })
}
