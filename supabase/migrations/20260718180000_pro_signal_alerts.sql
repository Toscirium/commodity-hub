-- Pro signal alerts use the existing price_alerts / price_alert_triggers flow.
-- Config contracts:
-- spread_signal: { spread_id, z_threshold, direction: rich|cheap|either }
-- carry_signal: { product_id, annualized_threshold, direction: contango|backwardation|either }
-- seasonality_signal: { commodity, min_avg_return, min_hit_rate }
CREATE OR REPLACE FUNCTION public.validate_price_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tier TEXT;
BEGIN
  tier := public.get_user_tier(NEW.user_id);
  IF NEW.alert_type = 'pct_move' AND tier = 'free' THEN RAISE EXCEPTION 'Percent move alerts require Premium tier' USING ERRCODE = 'check_violation'; END IF;
  IF NEW.alert_type IN ('volatility_band','spread','news_keyword','spread_signal','carry_signal','seasonality_signal') AND tier <> 'pro' THEN RAISE EXCEPTION 'Signal alerts require Pro tier' USING ERRCODE = 'check_violation'; END IF;
  IF NEW.alert_type NOT IN ('price','pct_move','volatility_band','spread','news_keyword','spread_signal','carry_signal','seasonality_signal') THEN RAISE EXCEPTION 'Unknown alert_type' USING ERRCODE = 'check_violation'; END IF;
  IF NEW.alert_type = 'price' AND (NEW.condition IS NULL OR NEW.target_price IS NULL) THEN RAISE EXCEPTION 'Price alerts need condition and target_price' USING ERRCODE = 'check_violation'; END IF;
  IF NEW.alert_type <> 'price' AND NEW.config IS NULL THEN RAISE EXCEPTION 'Smart alerts need a config object' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END;
$$;
