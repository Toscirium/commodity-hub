-- ============================================================
-- Track which store a subscriber's active subscription actually
-- lives on (Play Store, App Store, RevenueCat Billing/Stripe, ...).
--
-- Without this, "Manage subscription" had to guess based on the
-- CURRENT device/platform instead of where the purchase actually
-- happened — a user who subscribed on the web via Web Billing but
-- is now using the Android app would get sent to the Play Store
-- subscriptions page, which has never heard of their subscription,
-- instead of the Stripe Billing Portal. This column lets the client
-- route to the right place regardless of what platform it's opened
-- from. See revenuecat-webhook, which is the only writer (per the
-- RESTRICTIVE policy below — same trust boundary as the other
-- billing columns it already locks down).
--
-- Values match RevenueCat's webhook `event.store` enum exactly:
-- https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_store TEXT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_store_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_store_check
  CHECK (subscription_store IS NULL OR subscription_store IN (
    'AMAZON', 'APP_STORE', 'MAC_APP_STORE', 'PADDLE', 'PLAY_STORE',
    'PROMOTIONAL', 'RC_BILLING', 'ROKU', 'STRIPE', 'TEST_STORE'
  ));

-- Re-create profiles_block_subscription_field_writes (see
-- 20260516163623_2e6ae5ae-becf-48c1-b476-d35c04e2770a.sql) to also cover
-- this column — it's billing metadata the webhook owns, same as
-- subscription_tier/subscription_active/billing_state above it.
DROP POLICY IF EXISTS profiles_block_subscription_field_writes ON public.profiles;
CREATE POLICY profiles_block_subscription_field_writes
ON public.profiles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  subscription_tier        IS NOT DISTINCT FROM (SELECT p.subscription_tier        FROM public.profiles p WHERE p.id = profiles.id)
  AND subscription_active  IS NOT DISTINCT FROM (SELECT p.subscription_active     FROM public.profiles p WHERE p.id = profiles.id)
  AND subscription_end     IS NOT DISTINCT FROM (SELECT p.subscription_end        FROM public.profiles p WHERE p.id = profiles.id)
  AND billing_state        IS NOT DISTINCT FROM (SELECT p.billing_state           FROM public.profiles p WHERE p.id = profiles.id)
  AND grace_period_expires_at IS NOT DISTINCT FROM (SELECT p.grace_period_expires_at FROM public.profiles p WHERE p.id = profiles.id)
  AND subscription_store    IS NOT DISTINCT FROM (SELECT p.subscription_store      FROM public.profiles p WHERE p.id = profiles.id)
);
