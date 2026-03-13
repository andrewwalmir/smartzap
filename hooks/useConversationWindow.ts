import { useEffect, useMemo, useState } from 'react'
import type { InboxConversation } from '@/types'
import {
  formatElapsedSinceLastMessage,
  getWindowExpiresAt,
  isWindowOpen,
} from '@/lib/inbox/conversation-window'

const POLL_INTERVAL_MS = 60_000

export function useConversationWindow(conversation: InboxConversation | null) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    setNow(new Date())
  }, [conversation?.last_message_at])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date())
    }, POLL_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [])

  return useMemo(() => {
    const lastMessageAt = conversation?.last_message_at ?? null
    const expiresAt = getWindowExpiresAt(lastMessageAt)

    return {
      windowOpen: isWindowOpen(lastMessageAt, now),
      expiresAt,
      elapsedLabel: formatElapsedSinceLastMessage(lastMessageAt, now),
      hasMessages: Boolean(lastMessageAt),
    }
  }, [conversation?.last_message_at, now])
}
