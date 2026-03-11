-- Fix realtime subscriptions for authenticated users on inbox tables
-- The original init script only gave SELECT access to "anon" role via RLS.
-- This prevents the dashboard (which uses authenticated roles when a session exists)
-- from receiving Realtime INSERTS via websockets, causing messages to not appear until reload.

-- For inbox_conversations
BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_select_inbox_conversations' AND tablename = 'inbox_conversations'
    ) THEN
        CREATE POLICY "authenticated_select_inbox_conversations" ON public.inbox_conversations FOR SELECT TO authenticated USING (true);
    END IF;
  END
  $$;

-- For inbox_messages
  DO $$
  BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_select_inbox_messages' AND tablename = 'inbox_messages'
    ) THEN
        CREATE POLICY "authenticated_select_inbox_messages" ON public.inbox_messages FOR SELECT TO authenticated USING (true);
    END IF;
  END
  $$;
COMMIT;
