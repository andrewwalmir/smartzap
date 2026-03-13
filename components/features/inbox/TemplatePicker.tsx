'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw, Search } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { templateService } from '@/services/templateService'
import { Button } from '@/components/ui/button'
import type { Template } from '@/types'
import { TemplateParamsForm } from './TemplateParamsForm'

interface TemplatePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSendTemplate: (template: Template, values: Record<string, string>) => Promise<void>
  isSending?: boolean
}

export function TemplatePicker({
  open,
  onOpenChange,
  onSendTemplate,
  isSending = false,
}: TemplatePickerProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [fetchKey, setFetchKey] = useState(0)

  const handleRetry = useCallback(() => {
    setFetchKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (!open) return

    let active = true
    setIsLoading(true)
    setError(null)

    templateService
      .getAll()
      .then((result) => {
        if (!active) return
        const approved = result.filter((template) => template.status === 'APPROVED')
        setTemplates(approved)
        setSelectedTemplate((current) => current ?? approved[0] ?? null)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Falha ao carregar templates')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [open, fetchKey])

  const filteredTemplates = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return templates
    return templates.filter((template) => template.name.toLowerCase().includes(term))
  }, [search, templates])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full border-l border-[var(--ds-border-subtle)] bg-[var(--ds-bg-base)] p-0 sm:max-w-4xl">
        <SheetHeader className="border-b border-[var(--ds-border-subtle)]">
          <SheetTitle>Selecionar Template</SheetTitle>
          <SheetDescription>
            Escolha um template aprovado para reabrir ou iniciar a conversa.
          </SheetDescription>
        </SheetHeader>

        <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[320px_1px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col border-b border-[var(--ds-border-subtle)] md:border-b-0">
            <div className="p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar template"
                  className="pl-9"
                />
              </div>
            </div>

            <ScrollArea className="flex-1 px-4 pb-4">
              {isLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-[var(--ds-text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando templates...
                </div>
              ) : null}

              {error ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRetry}
                      className="shrink-0 text-red-200 hover:text-red-100"
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Tentar novamente
                    </Button>
                  </div>
                </div>
              ) : null}

              {!isLoading && !error && filteredTemplates.length === 0 ? (
                <p className="py-6 text-sm text-[var(--ds-text-muted)]">
                  Nenhum template aprovado encontrado.
                </p>
              ) : null}

              <div className="space-y-2">
                {filteredTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplate(template)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      selectedTemplate?.id === template.id
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/40 hover:bg-[var(--ds-bg-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-[var(--ds-text-primary)]">
                        {template.name}
                      </p>
                      <Badge variant="outline">{template.category}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs text-[var(--ds-text-muted)]">
                      {template.preview || template.content}
                    </p>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          <Separator orientation="vertical" className="hidden h-full md:block" />

          <div className="min-h-0 overflow-y-auto p-4">
            {selectedTemplate ? (
              <TemplateParamsForm
                template={selectedTemplate}
                isSending={isSending}
                onSubmit={async (values) => {
                  await onSendTemplate(selectedTemplate, values)
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--ds-text-muted)]">
                Selecione um template para ver o preview.
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
