'use client'

import { Clock3, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WindowClosedBannerProps {
  onSelectTemplate?: () => void
  elapsedLabel?: string | null
  hasMessages?: boolean
}

export function WindowClosedBanner({
  onSelectTemplate,
  elapsedLabel,
  hasMessages = true,
}: WindowClosedBannerProps) {
  return (
    <div className="mx-3 mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-amber-100">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-amber-500/15 p-2 text-amber-300">
          <Clock3 className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {hasMessages
              ? 'Janela de 24h expirou. Envie um template para reabrir a conversa.'
              : 'Esta conversa ainda nao tem mensagens. Envie um template para iniciar a conversa.'}
          </p>
          {elapsedLabel && (
            <p className="mt-1 text-xs text-amber-200/80">{elapsedLabel}</p>
          )}
        </div>

        {onSelectTemplate && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0 bg-amber-100/10 text-amber-50 hover:bg-amber-100/20"
            onClick={onSelectTemplate}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Selecionar Template
          </Button>
        )}
      </div>
    </div>
  )
}
