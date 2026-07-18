-- Subscribers: add owner-scoped UPDATE and DELETE policies
CREATE POLICY "subscribers_update_own"
ON public.subscribers
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "subscribers_delete_own"
ON public.subscribers
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Sentiment votes: restrict existing policy to authenticated role only
DROP POLICY IF EXISTS "Users can manage their own sentiment votes" ON public.sentiment_votes;

CREATE POLICY "Users can manage their own sentiment votes"
ON public.sentiment_votes
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);