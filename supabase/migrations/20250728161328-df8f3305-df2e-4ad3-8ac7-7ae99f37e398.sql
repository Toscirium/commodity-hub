-- Add commodity_price_api_credentials column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN commodity_price_api_credentials TEXT;