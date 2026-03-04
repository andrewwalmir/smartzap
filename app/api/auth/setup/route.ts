/**
 * Setup API
 * 
 * POST: Complete initial setup (company, email, phone)
 * Password is managed via MASTER_PASSWORD env var
 */

import { NextRequest, NextResponse } from 'next/server'
import { completeSetup, isSetupComplete } from '@/lib/user-auth'

export async function POST(request: NextRequest) {
  try {
    // Check if already setup
    const setupComplete = await isSetupComplete()

    if (setupComplete) {
      return NextResponse.json(
        { error: 'Setup já foi concluído' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { companyName, companyAdmin, email, phone } = body

    if (!companyName || !companyAdmin || !email || !phone) {
      return NextResponse.json(
        { error: 'Empresa, responsável, e-mail e telefone são obrigatórios' },
        { status: 400 }
      )
    }

    const result = await completeSetup(companyName, companyAdmin, email, phone)

    if (!result.success) {
      console.warn('[auth/setup] setup failed')
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      company: result.company,
    })
  } catch (error) {
    console.error('[auth/setup] unexpected error', error)
    return NextResponse.json(
      { error: 'Erro ao completar setup' },
      { status: 500 }
    )
  }
}
