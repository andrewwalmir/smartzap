import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// Tentamos importar validateSession, se falhar por restrições do Edge,
// podemos fazer fallback para validação básica.
import { validateSession } from '@/lib/user-auth'
import { Ratelimit } from '@upstash/ratelimit'
import { redis, isRedisConfigured } from '@/lib/redis'

// Mapeamento de rotas públicas
const PUBLIC_API_ROUTES = [
    '/api/webhook',
    '/api/health',
    '/api/system',
    '/api/auth/status',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/campaign/dispatch', // Tem auth própria via Upstash signature
    '/api/flows/endpoint',
    '/api/public', // Rotas públicas como lead forms
]

function isPublicApiRoute(pathname: string) {
    return PUBLIC_API_ROUTES.some(route =>
        pathname === route || pathname.startsWith(`${route}/`)
    )
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Protege apenas as rotas da API
    if (pathname.startsWith('/api/')) {
        // Permite rotas públicas
        if (isPublicApiRoute(pathname)) {
            return NextResponse.next()
        }

        // 1. Tentar auth via API Key (ex: integrações externas)
        const authHeader = request.headers.get('authorization')
        const apiKeyHeader = request.headers.get('x-api-key')

        let apiKey = null
        if (authHeader?.startsWith('Bearer ')) {
            apiKey = authHeader.slice(7)
        } else if (apiKeyHeader) {
            apiKey = apiKeyHeader
        }

        if (apiKey) {
            const envApiKey = process.env.SMARTZAP_API_KEY
            const envAdminKey = process.env.SMARTZAP_ADMIN_KEY

            if ((envAdminKey && apiKey === envAdminKey) || (envApiKey && apiKey === envApiKey)) {
                // Rate Limiting para API Keys Públicas (100 reqs/10s)
                if (envApiKey && apiKey === envApiKey) {
                    const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
                    const identifier = `api_${apiKey.slice(-4)}_${ip}`

                    if (isRedisConfigured() && redis) {
                        try {
                            const ratelimit = new Ratelimit({
                                redis,
                                limiter: Ratelimit.slidingWindow(100, '10 s'),
                                analytics: true,
                            })
                            const { success, limit, reset, remaining } = await ratelimit.limit(identifier)

                            if (!success) {
                                return NextResponse.json(
                                    { error: 'Rate limit exceeded. Try again later.' },
                                    {
                                        status: 429,
                                        headers: {
                                            'X-RateLimit-Limit': limit.toString(),
                                            'X-RateLimit-Remaining': remaining.toString(),
                                            'X-RateLimit-Reset': reset.toString()
                                        }
                                    }
                                )
                            }
                        } catch (err) {
                            console.error('[RateLimit] Error:', err)
                        }
                    }
                }
                return NextResponse.next()
            }
            return NextResponse.json({ error: 'Chave de API inválida' }, { status: 401 })
        }

        // 2. Tentar auth via Cookie de Sessão (Dashboard UI)
        const sessionCookie = request.cookies.get('smartzap_session')
        if (sessionCookie?.value) {
            try {
                const isValid = await validateSession()
                if (isValid) {
                    return NextResponse.next()
                }
            } catch (error) {
                console.error('[Middleware] Erro ao validar sessão:', error)
            }
        }

        // Sem API Key válida ou Sessão válida = 401
        return NextResponse.json(
            { error: 'Não autorizado. Forneça uma API Key via header (Authorization: Bearer <key> ou X-API-Key: <key>) ou faça login.' },
            { status: 401 }
        )
    }

    // Permite acesso a assets e rotas da UI
    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Intercepta todas as requisições, exceto:
         * - _next/static (arquivos estáticos)
         * - _next/image (imagens otimizadas)
         * - favicon.ico (favicon)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
}
