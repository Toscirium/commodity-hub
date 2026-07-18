-- Remove commodity_price_api_credentials column from profiles table
-- This column exposes API credentials via client-side RLS SELECT policy
-- It is not used anywhere in application code or edge functions
ALTER TABLE public.profiles DROP COLUMN IF EXISTS commodity_price_api_credentials;