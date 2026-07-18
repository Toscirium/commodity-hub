DROP POLICY IF EXISTS subscribers_insert_own ON public.subscribers;

CREATE POLICY subscribers_insert_own_free_only
ON public.subscribers
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND subscribed = false
  AND (subscription_tier IS NULL OR subscription_tier = 'free')
  AND subscription_end IS NULL
  AND stripe_customer_id IS NULL
);