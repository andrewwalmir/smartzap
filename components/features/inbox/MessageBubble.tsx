'use client'

import React, { memo, useMemo } from 'react'
import { AlertCircle, ArrowRightLeft, Check, CheckCheck, Clock, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatTime } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import { WhatsAppFormattedText } from '@/lib/whatsapp-text-formatter'
import type { DeliveryStatus, InboxMessage, Sentiment } from '@/types'

interface ParsedTemplateMessage {
  templateName: string
  header?: {
    type: 'text' | 'image' | 'video' | 'document' | 'location'
    content: string
  }
  body: string
  footer?: string
  buttons: Array<{
    type: 'url' | 'phone' | 'quick_reply' | 'copy_code' | 'flow' | 'other'
    text: string
  }>
}

function isTemplateMessage(content: string): boolean {
  return content.startsWith('📋 *Template:')
}

function parseTemplateMessage(content: string): ParsedTemplateMessage | null {
  if (!isTemplateMessage(content)) return null

  const lines = content.split('\n')
  const nameMatch = lines[0]?.match(/📋 \*Template: (.+)\*/)
  if (!nameMatch) return null

  const result: ParsedTemplateMessage = {
    templateName: nameMatch[1],
    body: '',
    buttons: [],
  }

  let currentSection: 'header' | 'body' | 'footer' | 'buttons' = 'header'
  const bodyLines: string[] = []

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]

    if (line === '[🖼️ Imagem]') {
      result.header = { type: 'image', content: 'Imagem' }
      continue
    }
    if (line === '[🎬 Vídeo]') {
      result.header = { type: 'video', content: 'Vídeo' }
      continue
    }
    if (line === '[📄 Documento]') {
      result.header = { type: 'document', content: 'Documento' }
      continue
    }
    if (line.startsWith('[📍 ')) {
      result.header = {
        type: 'location',
        content: line.match(/\[📍 (.+)\]/)?.[1] || 'Localização',
      }
      continue
    }

    if (currentSection === 'header' && line.startsWith('*') && line.endsWith('*') && !line.includes('Template:')) {
      result.header = { type: 'text', content: line.slice(1, -1) }
      continue
    }

    if (line === '---') {
      currentSection = 'buttons'
      continue
    }

    if (currentSection === 'buttons' && line.startsWith('[')) {
      const match = line.match(/\[(.*?)\s(.+)\]/)
      if (match) {
        const marker = match[1]
        const text = match[2]
        let type: ParsedTemplateMessage['buttons'][0]['type'] = 'other'
        if (marker === '🔗') type = 'url'
        else if (marker === '📞') type = 'phone'
        else if (marker === '💬') type = 'quick_reply'
        else if (marker === '📋') type = 'copy_code'
        else if (marker === '📝') type = 'flow'
        result.buttons.push({ type, text })
      }
      continue
    }

    if (line.startsWith('_') && line.endsWith('_') && line.length > 2) {
      result.footer = line.slice(1, -1)
      continue
    }

    if (currentSection !== 'buttons') {
      bodyLines.push(line)
    }
  }

  result.body = bodyLines.join('\n').trim()
  return result
}

export interface MessageBubbleProps {
  message: InboxMessage
  agentName?: string
  isFirstInGroup?: boolean
  isLastInGroup?: boolean
}

function DeliveryStatusIcon({ status }: { status: DeliveryStatus }) {
  const base = 'h-2.5 w-2.5'
  switch (status) {
    case 'pending':
      return <Clock className={cn(base, 'text-[var(--ds-text-muted)]')} />
    case 'sent':
      return <Check className={cn(base, 'text-[var(--ds-text-muted)]')} />
    case 'delivered':
      return <CheckCheck className={cn(base, 'text-[var(--ds-text-muted)]')} />
    case 'read':
      return <CheckCheck className={cn(base, 'text-blue-400')} />
    case 'failed':
      return <AlertCircle className={cn(base, 'text-red-400')} />
    default:
      return null
  }
}

function SentimentIndicator({ sentiment }: { sentiment: Sentiment }) {
  const colors: Record<Sentiment, string> = {
    positive: 'bg-emerald-500/60',
    neutral: 'bg-[var(--ds-text-muted)]/60',
    negative: 'bg-amber-500/60',
    frustrated: 'bg-red-500/60',
  }

  const labels: Record<Sentiment, string> = {
    positive: 'Positivo',
    neutral: 'Neutro',
    negative: 'Negativo',
    frustrated: 'Frustrado',
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('h-1 w-1 rounded-full', colors[sentiment])} />
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        {labels[sentiment]}
      </TooltipContent>
    </Tooltip>
  )
}

function TemplateMessageContent({
  parsed,
  time,
  deliveryStatus,
  headerImageUrl,
}: {
  parsed: ParsedTemplateMessage
  time: string
  deliveryStatus?: DeliveryStatus
  headerImageUrl?: string | null
}) {
  return (
    <div className="flex w-full">
      <div className="mr-3 w-1 shrink-0 rounded-full bg-emerald-500" />

      <div className="flex min-w-0 flex-1 flex-col">
        {parsed.header?.type === 'text' && (
          <p className="mb-3 text-base font-bold text-white">{parsed.header.content}</p>
        )}

        {parsed.header && parsed.header.type !== 'text' && (
          <div className="mb-3 space-y-2">
            {parsed.header.type === 'image' && headerImageUrl ? (
              <img
                src={headerImageUrl}
                alt="Preview do header do template"
                className="h-40 w-full rounded-xl object-cover"
              />
            ) : null}

            <div className="flex items-center gap-2 rounded bg-zinc-800/50 px-2 py-1.5 text-sm text-zinc-300">
              <span>
                {parsed.header.type === 'image' && '🖼️'}
                {parsed.header.type === 'video' && '🎬'}
                {parsed.header.type === 'document' && '📄'}
                {parsed.header.type === 'location' && '📍'}
              </span>
              <span>{parsed.header.content}</span>
            </div>
          </div>
        )}

        {parsed.body && (
          <div className="whitespace-pre-wrap break-words text-base leading-relaxed text-zinc-200">
            <WhatsAppFormattedText text={parsed.body} />
          </div>
        )}

        {parsed.footer && (
          <div className="mt-5 border-t border-zinc-600/60 pt-4">
            <p className="text-sm text-zinc-500">{parsed.footer}</p>
          </div>
        )}

        {parsed.buttons.length > 0 && (
          <div className="mt-4 space-y-2">
            {parsed.buttons.map((button, index) => (
              <div
                key={`${button.type}-${button.text}-${index}`}
                className="flex items-center justify-between rounded-xl bg-zinc-800/90 px-4 py-3"
              >
                <span className="text-sm text-zinc-300">{button.text}</span>
                {(button.type === 'url' || button.type === 'flow') && (
                  <svg
                    className="h-4 w-4 shrink-0 text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M17 7H7M17 7V17" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-end gap-1.5">
          <Badge variant="success" className="rounded-md px-1.5 py-0 text-[10px]">
            Template
          </Badge>
          <span className="text-[10px] text-zinc-500">{parsed.templateName}</span>
          <span className="text-[10px] text-zinc-600">·</span>
          <span className="text-[10px] text-zinc-500">{time}</span>
          {deliveryStatus ? <DeliveryStatusIcon status={deliveryStatus} /> : null}
        </div>
      </div>
    </div>
  )
}

function isHandoffMessage(content: string): boolean {
  return content.includes('**Transferência') || content.includes('**Motivo:**')
}

function parseHandoffMessage(content: string): { title: string; reason: string; summary: string } | null {
  if (!isHandoffMessage(content)) return null

  return {
    title: 'Transferido para humano',
    reason: content.match(/\*\*Motivo:\*\*\s*(.+?)(?=\n|$)/s)?.[1]?.trim() || '',
    summary: content.match(/\*\*Resumo:\*\*\s*(.+?)(?=\n|$)/s)?.[1]?.trim() || '',
  }
}

export const MessageBubble = memo(function MessageBubble({
  message,
  agentName: _agentName,
  isFirstInGroup = true,
  isLastInGroup = true,
}: MessageBubbleProps) {
  const { direction, content, delivery_status, created_at, ai_sentiment, ai_sources } = message

  const isInbound = direction === 'inbound'
  const isAIResponse = !isInbound && (message.ai_response_id || ai_sources)
  const handoffData = parseHandoffMessage(content)
  const parsedTemplate = useMemo(() => (isInbound ? null : parseTemplateMessage(content)), [content, isInbound])
  const isTemplate = parsedTemplate !== null
  const time = formatTime(created_at)
  const templateHeaderImageUrl =
    typeof message.payload?.headerMediaPreviewUrl === 'string'
      ? message.payload.headerMediaPreviewUrl
      : null

  if (handoffData) {
    const hasDetails = handoffData.reason || handoffData.summary

    return (
      <div className="my-3 flex justify-center animate-in fade-in duration-150">
        <div
          className={cn(
            'border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/50',
            hasDetails ? 'max-w-md rounded-xl px-4 py-3' : 'rounded-full px-4 py-2',
          )}
        >
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-3.5 w-3.5 text-amber-500/70" />
            <span className="text-xs font-medium text-[var(--ds-text-secondary)]">{handoffData.title}</span>
            <span className="text-[10px] text-[var(--ds-text-muted)]">·</span>
            <span className="text-[10px] text-[var(--ds-text-muted)]">{time}</span>
          </div>

          {hasDetails && (
            <div className="mt-2 space-y-1 border-t border-[var(--ds-border-subtle)] pt-2">
              {handoffData.reason && (
                <p className="text-xs text-[var(--ds-text-secondary)]">
                  <span className="text-[var(--ds-text-muted)]">Motivo:</span> {handoffData.reason}
                </p>
              )}
              {handoffData.summary && (
                <p className="text-xs text-[var(--ds-text-secondary)]">
                  <span className="text-[var(--ds-text-muted)]">Resumo:</span> {handoffData.summary}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  function getBorderRadius() {
    if (isInbound) {
      if (isFirstInGroup && isLastInGroup) return 'rounded-2xl rounded-bl-sm'
      if (isFirstInGroup) return 'rounded-2xl rounded-bl-md'
      if (isLastInGroup) return 'rounded-xl rounded-tl-md rounded-bl-sm'
      return 'rounded-xl rounded-l-md'
    }

    if (isFirstInGroup && isLastInGroup) return 'rounded-2xl rounded-br-sm'
    if (isFirstInGroup) return 'rounded-2xl rounded-br-md'
    if (isLastInGroup) return 'rounded-xl rounded-tr-md rounded-br-sm'
    return 'rounded-xl rounded-r-md'
  }

  return (
    <div
      className={cn(
        'flex w-full items-end gap-1.5 animate-in fade-in duration-100',
        isInbound ? 'justify-start' : 'justify-end',
        !isLastInGroup && 'mb-0.5',
        isLastInGroup && 'mb-2',
      )}
    >
      <div className={cn('flex max-w-[85%] flex-col', isInbound ? 'items-start' : 'items-end')}>
        <div
          className={cn(
            'relative px-3.5 py-2',
            getBorderRadius(),
            isInbound && 'bg-[var(--ds-bg-surface)]/80 text-[var(--ds-text-primary)]',
            isTemplate && 'bg-zinc-900/95 text-white',
            !isInbound && !isAIResponse && !isTemplate && 'bg-emerald-600/80 text-white',
            isAIResponse && !isTemplate && 'bg-emerald-700/70 text-emerald-50',
          )}
        >
          {isTemplate && parsedTemplate ? (
            <TemplateMessageContent
              parsed={parsedTemplate}
              time={time}
              deliveryStatus={delivery_status}
              headerImageUrl={templateHeaderImageUrl}
            />
          ) : (
            <>
              <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
                <WhatsAppFormattedText text={content} />
              </p>

              {isAIResponse && ai_sources && ai_sources.length > 0 && isLastInGroup && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-emerald-200/70 transition-colors hover:text-emerald-100">
                      <Sparkles className="h-2.5 w-2.5" />
                      <span>{ai_sources.length} fontes</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <ul className="space-y-0.5 text-xs text-[var(--ds-text-secondary)]">
                      {ai_sources.map((source, index) => (
                        <li key={index} className="truncate">
                          • {source.title}
                        </li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </div>

        {isLastInGroup && !isTemplate && (
          <div
            className={cn(
              'mt-1 flex items-center gap-1.5 px-1',
              isInbound ? 'flex-row' : 'flex-row-reverse',
            )}
          >
            {isInbound && ai_sentiment ? <SentimentIndicator sentiment={ai_sentiment as Sentiment} /> : null}
            <span className="text-[10px] text-[var(--ds-text-muted)]">{time}</span>
            {!isInbound && delivery_status ? <DeliveryStatusIcon status={delivery_status} /> : null}
          </div>
        )}
      </div>
    </div>
  )
})
