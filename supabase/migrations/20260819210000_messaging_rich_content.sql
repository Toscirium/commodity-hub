-- Rich content for direct messages: image attachments, emoji reactions,
-- and cached link-preview metadata. Everything here follows the same
-- "server-authoritative" shape the 20260817140000 migration established:
-- no client INSERT/UPDATE/DELETE policies anywhere below — every write
-- goes through the `messages` edge function using the service-role key,
-- because that's also where the size/mime/emoji validation, membership
-- checks, and rate limiting live. Only SELECT policies exist here, and
-- only so Realtime's postgres_changes can keep using the existing
-- "something changed, refetch via the edge function" pattern.

-- 1. Attachments + link previews live as columns directly on `messages`
-- (one attachment per message, matching the simple v1 UI) rather than a
-- separate table — there's nothing else to join against yet.
ALTER TABLE public.messages ADD COLUMN attachment_path text;
ALTER TABLE public.messages ADD COLUMN attachment_mime text;
ALTER TABLE public.messages ADD COLUMN attachment_width integer;
ALTER TABLE public.messages ADD COLUMN attachment_height integer;
ALTER TABLE public.messages ADD CONSTRAINT messages_attachment_mime_check
  CHECK (attachment_mime IS NULL OR attachment_mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif'));
ALTER TABLE public.messages ADD CONSTRAINT messages_attachment_path_requires_mime
  CHECK ((attachment_path IS NULL) = (attachment_mime IS NULL));

-- link_preview is deliberately NOT part of the encrypted `body` — it's
-- metadata the edge function scrapes from a *publicly reachable* URL the
-- sender already chose to share (title/description/image/domain), so it
-- carries no more sensitivity than the plaintext link itself would. Kept
-- as plain jsonb so it's cheap to read back without a decrypt round trip.
ALTER TABLE public.messages ADD COLUMN link_preview jsonb;

-- 2. Emoji reactions. Fixed small allow-list (mirrored in the edge
-- function and the client's reaction picker) rather than free-text —
-- keeps this from becoming an arbitrary-string channel and keeps the
-- picker UI trivial (no emoji-picker dependency).
CREATE TABLE public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE INDEX message_reactions_message_id_idx ON public.message_reactions (message_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view reactions on their conversations" ON public.message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_reactions.message_id AND cm.user_id = auth.uid()
    )
  );
-- No INSERT/UPDATE/DELETE policy: writes are edge-function (service role) only.
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;

-- 3. Storage bucket for attachments. Private, and — same reasoning the
-- 20260817140000 migration applied to direct_conversation_keys — no
-- storage.objects policies are added for anon/authenticated. Uploads and
-- signed-URL reads both happen
-- server-side via the edge function's service-role client, which bypasses
-- RLS entirely, so client-facing storage policies would be dead code that
-- only widens the attack surface if ever misconfigured.
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', false)
ON CONFLICT (id) DO NOTHING;
