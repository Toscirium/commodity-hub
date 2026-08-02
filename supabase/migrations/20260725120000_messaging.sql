-- Private, direct messaging for sharing market tips and strategies.
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE public.direct_conversation_keys (
  user_low_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
  PRIMARY KEY (user_low_id, user_high_id),
  CONSTRAINT direct_conversation_distinct_members CHECK (user_low_id <> user_high_id)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_created_at_idx ON public.messages (conversation_id, created_at);
CREATE INDEX conversation_members_user_id_idx ON public.conversation_members (user_id, conversation_id);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_conversation_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their conversations" ON public.conversations
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = id AND cm.user_id = auth.uid()));
CREATE POLICY "Members can view conversation membership" ON public.conversation_members
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.conversation_members mine WHERE mine.conversation_id = conversation_id AND mine.user_id = auth.uid()));
CREATE POLICY "Members can update their read state" ON public.conversation_members
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Members can view messages" ON public.messages
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid()));
CREATE POLICY "Members can send messages" ON public.messages
  FOR INSERT WITH CHECK (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_conversation_from_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER messages_touch_conversation AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_from_message();

CREATE OR REPLACE FUNCTION public.messaging_search_users(search_text text)
RETURNS TABLE(id uuid, display_name text, avatar_url text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p.id, COALESCE(NULLIF(p.full_name, ''), split_part(p.email, '@', 1)), p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND (p.full_name ILIKE '%' || left(trim(search_text), 80) || '%' OR p.email ILIKE '%' || left(trim(search_text), 80) || '%')
  ORDER BY p.full_name NULLS LAST
  LIMIT 12;
$$;

CREATE OR REPLACE FUNCTION public.messaging_start_direct_conversation(recipient_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_user_id uuid := auth.uid();
  low_id uuid;
  high_id uuid;
  result_id uuid;
BEGIN
  IF current_user_id IS NULL OR recipient_id IS NULL OR current_user_id = recipient_id THEN
    RAISE EXCEPTION 'A different signed-in recipient is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = recipient_id) THEN
    RAISE EXCEPTION 'Recipient not found';
  END IF;
  low_id := LEAST(current_user_id, recipient_id);
  high_id := GREATEST(current_user_id, recipient_id);
  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO result_id;
  INSERT INTO public.direct_conversation_keys (user_low_id, user_high_id, conversation_id)
  VALUES (low_id, high_id, result_id)
  ON CONFLICT (user_low_id, user_high_id) DO UPDATE SET conversation_id = public.direct_conversation_keys.conversation_id
  RETURNING conversation_id INTO result_id;
  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (result_id, current_user_id), (result_id, recipient_id)
  ON CONFLICT DO NOTHING;
  RETURN result_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_list_conversations()
RETURNS TABLE(conversation_id uuid, participant_id uuid, participant_name text, participant_avatar_url text, last_message text, last_message_at timestamptz, unread_count bigint)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT c.id, other.user_id, COALESCE(NULLIF(p.full_name, ''), split_part(p.email, '@', 1)), p.avatar_url,
    latest.body, latest.created_at,
    COALESCE((SELECT count(*) FROM public.messages unread WHERE unread.conversation_id = c.id AND unread.sender_id <> auth.uid() AND unread.created_at > COALESCE(me.last_read_at, '-infinity'::timestamptz)), 0)
  FROM public.conversations c
  JOIN public.conversation_members me ON me.conversation_id = c.id AND me.user_id = auth.uid()
  JOIN public.conversation_members other ON other.conversation_id = c.id AND other.user_id <> auth.uid()
  JOIN public.profiles p ON p.id = other.user_id
  LEFT JOIN LATERAL (SELECT body, created_at FROM public.messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) latest ON true
  ORDER BY COALESCE(latest.created_at, c.updated_at) DESC;
$$;

CREATE OR REPLACE FUNCTION public.messaging_list_messages(target_conversation_id uuid)
RETURNS TABLE(id uuid, sender_id uuid, sender_name text, body text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT m.id, m.sender_id, COALESCE(NULLIF(p.full_name, ''), split_part(p.email, '@', 1)), m.body, m.created_at
  FROM public.messages m JOIN public.profiles p ON p.id = m.sender_id
  WHERE m.conversation_id = target_conversation_id
    AND EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = target_conversation_id AND cm.user_id = auth.uid())
  ORDER BY m.created_at ASC LIMIT 250;
$$;

CREATE OR REPLACE FUNCTION public.messaging_mark_read(target_conversation_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.conversation_members SET last_read_at = now()
  WHERE conversation_id = target_conversation_id AND user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.messaging_search_users(text), public.messaging_start_direct_conversation(uuid), public.messaging_list_conversations(), public.messaging_list_messages(uuid), public.messaging_mark_read(uuid) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
