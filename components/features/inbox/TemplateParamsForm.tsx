'use client'

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Template } from '@/types'
import {
  extractTemplateVariables,
  getTemplateBodyText,
  getTemplateButtons,
  getTemplateFooterText,
  getTemplateHeaderImageUrl,
  getTemplateHeaderText,
} from '@/lib/inbox/template-utils'

interface TemplateParamsFormProps {
  template: Template
  isSending?: boolean
  onSubmit: (values: Record<string, string>) => Promise<void> | void
}

function replaceVars(text: string, values: Record<string, string>) {
  return text.replace(/\{\{(\d+)\}\}/g, (_, key: string) => values[key] || `{{${key}}}`)
}

export function TemplateParamsForm({
  template,
  isSending = false,
  onSubmit,
}: TemplateParamsFormProps) {
  const variableKeys = useMemo(() => extractTemplateVariables(template), [template])
  const [values, setValues] = useState<Record<string, string>>({})

  const headerText = getTemplateHeaderText(template)
  const bodyText = getTemplateBodyText(template)
  const footerText = getTemplateFooterText(template)
  const buttons = getTemplateButtons(template)
  const headerImageUrl = getTemplateHeaderImageUrl(template)

  const isValid = variableKeys.every((key) => String(values[key] || '').trim())

  async function handleSubmit() {
    if (!isValid && variableKeys.length > 0) return
    await onSubmit(values)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/40 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--ds-text-primary)]">{template.name}</p>
          <p className="text-xs text-[var(--ds-text-muted)]">
            Categoria {template.category} · Status {template.status}
          </p>
        </div>

        {headerImageUrl && (
          <img
            src={headerImageUrl}
            alt={`Preview do header do template ${template.name}`}
            className="h-40 w-full rounded-lg object-cover"
          />
        )}

        {headerText && (
          <p className="text-sm font-semibold text-[var(--ds-text-primary)]">
            {replaceVars(headerText, values)}
          </p>
        )}

        <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ds-text-secondary)]">
          {replaceVars(bodyText, values)}
        </div>

        {footerText && (
          <p className="border-t border-[var(--ds-border-subtle)] pt-3 text-xs text-[var(--ds-text-muted)]">
            {footerText}
          </p>
        )}

        {buttons.length > 0 && (
          <div className="space-y-2">
            {buttons.map((button, index) => (
              <div
                key={`${button.type}-${button.text}-${index}`}
                className="rounded-lg border border-[var(--ds-border-subtle)] px-3 py-2 text-sm text-[var(--ds-text-secondary)]"
              >
                {button.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {variableKeys.length > 0 && (
        <div className="mt-4 space-y-3">
          {variableKeys.map((key) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-medium text-[var(--ds-text-secondary)]" htmlFor={`template-var-${key}`}>
                Variavel {`{{${key}}}`}
              </label>
              <Input
                id={`template-var-${key}`}
                value={values[key] || ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [key]: event.target.value }))
                }
                placeholder={`Preencha ${`{{${key}}}`}`}
                disabled={isSending}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-5">
        <Button
          type="button"
          className="w-full"
          onClick={handleSubmit}
          disabled={isSending || (variableKeys.length > 0 && !isValid)}
        >
          {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Enviar Template
        </Button>
      </div>
    </div>
  )
}
