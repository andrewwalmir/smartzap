import type { Template, TemplateComponent } from '@/types'
import { renderTemplatePreviewText } from '@/lib/whatsapp/template-contract'

export function getTemplateBodyText(template: Template): string {
  const bodyComponent = (template.components || []).find((component) => component.type === 'BODY')
  return bodyComponent?.text || template.content || ''
}

export function extractTemplateVariables(template: Template): string[] {
  const source = [getTemplateBodyText(template)]
  const headerText = (template.components || []).find(
    (component) => component.type === 'HEADER' && component.format === 'TEXT',
  )?.text

  if (headerText) source.push(headerText)

  const found = new Set<string>()
  for (const text of source) {
    for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) {
      if (match[1]) found.add(match[1])
    }
  }

  return Array.from(found).sort((a, b) => Number(a) - Number(b))
}

export function resolveTemplateParams(values: Record<string, string>): { body: Array<{ key: string; text: string }> } {
  const ordered = Object.entries(values)
    .filter(([, value]) => String(value).trim())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([key, text]) => ({ key, text }))

  return { body: ordered }
}

export function mapTemplateParamsForApi(values: Record<string, string>): Record<string, string[]> {
  const body = Object.entries(values)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, value]) => value)

  return body.length > 0 ? { body } : {}
}

export function renderInboxTemplatePreview(template: Template, values: Record<string, string>): string {
  return renderTemplatePreviewText(template, resolveTemplateParams(values))
}

export function getTemplateHeaderImageUrl(template: Template): string | null {
  const header = (template.components || []).find(
    (component) => component.type === 'HEADER' && component.format === 'IMAGE',
  )

  if (!header) return null
  return template.headerMediaPreviewUrl || null
}

export function hasImageHeader(template: Template): boolean {
  return (template.components || []).some(
    (component) => component.type === 'HEADER' && component.format === 'IMAGE',
  )
}

export function getTemplateHeaderText(template: Template): string | null {
  const header = (template.components || []).find(
    (component) => component.type === 'HEADER' && component.format === 'TEXT',
  )
  return header?.text || null
}

export function getTemplateFooterText(template: Template): string | null {
  const footer = (template.components || []).find((component) => component.type === 'FOOTER')
  return footer?.text || null
}

export function getTemplateButtons(template: Template): NonNullable<TemplateComponent['buttons']> {
  return (template.components || [])
    .filter((component) => component.type === 'BUTTONS')
    .flatMap((component) => component.buttons || [])
}
