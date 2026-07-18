-- Fix all existing functions with proper search paths
CREATE OR REPLACE FUNCTION public.update_sentiment_aggregates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.sentiment_aggregates (commodity_name, bullish_votes, bearish_votes, total_votes, average_confidence)
  SELECT 
    NEW.commodity_name,
    COUNT(*) FILTER (WHERE sentiment = 'bullish'),
    COUNT(*) FILTER (WHERE sentiment = 'bearish'),
    COUNT(*),
    AVG(confidence)
  FROM public.sentiment_votes 
  WHERE commodity_name = NEW.commodity_name
  ON CONFLICT (commodity_name) 
  DO UPDATE SET
    bullish_votes = EXCLUDED.bullish_votes,
    bearish_votes = EXCLUDED.bearish_votes,
    total_votes = EXCLUDED.total_votes,
    average_confidence = EXCLUDED.average_confidence,
    last_updated = now();
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.clean_old_recent_activities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $function$
BEGIN
  DELETE FROM public.recent_activities 
  WHERE user_id = NEW.user_id 
  AND id NOT IN (
    SELECT id FROM public.recent_activities 
    WHERE user_id = NEW.user_id 
    ORDER BY created_at DESC 
    LIMIT 50
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS profiles
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;