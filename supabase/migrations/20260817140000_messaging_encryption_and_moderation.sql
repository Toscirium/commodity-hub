-- Messaging hardening: encrypt message bodies at rest, add block/report
-- moderation, and force all messaging operations through the new
-- `messages` edge function (encryption, rate limiting, and block checks
-- all live there — they can't be enforced in a plain SQL RPC without
-- exposing the encryption key to Postgres itself).

-- 1. Encrypt at rest. `body` now holds base64 AES-256-GCM ciphertext for
-- any row inserted after this migration; `iv` holds the matching nonce.
-- Existing rows predate encryption and stay plaintext — `encrypted` tells
-- the edge function which rows need decrypting vs. returning as-is.
ALTER TABLE public.messages ADD COLUMN encrypted BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.messages ADD COLUMN iv TEXT;
UPDATE public.messages SET encrypted = false WHERE encrypted = true; -- flag pre-existing rows as legacy plaintext, one-time
ALTER TABLE public.messages ADD CONSTRAINT messages_iv_required_if_encrypted CHECK (NOT encrypted OR iv IS NOT NULL);

-- The old CHECK bounded plaintext length; ciphertext (base64, +GCM tag) is
-- larger for the same input and plaintext length is now validated in the
-- edge function before encryption. Replace with a looser sanity bound.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_body_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_body_length CHECK (char_length(body) BETWEEN 1 AND 8000);

-- 2. Moderation.
CREATE TABLE public.blocked_users (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocked_users_distinct CHECK (blocker_id <> blocked_id)
);
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY; -- no policies: edge-function (service role) only

CREATE TABLE public.message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY; -- no policies: edge-function (service role) only

-- 3. Force everything through the messages edge function. Sending must be
-- server-side (encryption + rate limit + block check can't live in a plain
-- RLS policy); dropping the INSERT policy leaves it default-deny for direct
-- client writes. SELECT policies on conversations/conversation_members/
-- messages stay as-is — ciphertext is harmless to read directly, and
-- Realtime's postgres_changes delivery depends on the client actually
-- having SELECT+RLS access (the client only uses those events as a
-- "something changed, refetch via the edge function" signal, never reads
-- body off the payload).
DROP POLICY IF EXISTS "Members can send messages" ON public.messages;

-- direct_conversation_keys is pure internal bookkeeping for the dedup
-- logic (now inside the edge function) — no legitimate client read/write.
REVOKE ALL ON public.direct_conversation_keys FROM anon, authenticated;

-- Superseded by the messages edge function (needs the encryption key,
-- rate limiting, and block checks that can't live in SQL).
DROP FUNCTION IF EXISTS public.messaging_search_users(text);
DROP FUNCTION IF EXISTS public.messaging_start_direct_conversation(uuid);
DROP FUNCTION IF EXISTS public.messaging_list_conversations();
DROP FUNCTION IF EXISTS public.messaging_list_messages(uuid);
DROP FUNCTION IF EXISTS public.messaging_mark_read(uuid);
