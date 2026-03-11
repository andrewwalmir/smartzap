/**
 * Next.js Instrumentation Hook
 * 
 * Executado quando o Next.js inicializa o servidor ou os Edge Functions.
 * O objetivo é aplicar monkey-patches globais de forma precoce, como
 * a supressão de console.log não gerenciados em Produção (Vercel).
 */

export function register() {
    // Apenas aplica bloqueio em runtime de produção de fato (evita abafar ambiente de dev)
    if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
        const _log = console.log;

        // Em produção, calamos a boca do console.log() ordinário para não exaurir a Vercel 
        // e sujar rastreamentos. O console.error() e console.warn() seguem normais e o
        // lib/logger também usa sua própria stream que não é afetada ou lida com isso.
        console.log = function (...args) {
            // Se o log for muito longo, ignora inteiramente (spam)
            if (args.length > 0 && typeof args[0] === 'string') {
                if (args[0].length > 500) return;

                // Abre exceção se for um log explicitamente focado em debug ou tracking
                // (Opcional: você pode deixar a função totalmente no-op)
                if (args[0].startsWith('[Dispatch]') || args[0].startsWith('[CRITICAL]')) {
                    _log.apply(console, args);
                }
            }
        };
    }
}
