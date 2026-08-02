-- Create table for Recent Activity feature
CREATE TABLE public.recent_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  commodity_name TEXT NOT NULL,
  commodity_symbol TEXT,
  activity_type TEXT NOT NULL DEFAULT 'view', -- view, trade, analyze
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for Favorites feature
CREATE TABLE public.user_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  commodity_name TEXT NOT NULL,
  commodity_symbol TEXT,
  commodity_group TEXT,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, commodity_name)
);

-- Create table for Price Comparison sessions
CREATE TABLE public.price_comparisons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  comparison_name TEXT NOT NULL,
  commodities JSONB NOT NULL, -- Array of commodity objects to compare
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for Market Status tracking
CREATE TABLE public.market_status_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market_name TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL,
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  trading_days INTEGER[] NOT NULL, -- Array of weekdays (0=Sunday, 6=Saturday)
  holidays JSONB, -- Array of holiday dates
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.recent_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_status_config ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for recent activities
CREATE POLICY "Users can view their own recent activities" ON public.recent_activities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own activities" ON public.recent_activities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own activities" ON public.recent_activities FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own activities" ON public.recent_activities FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for favorites
CREATE POLICY "Users can view their own favorites" ON public.user_favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own favorites" ON public.user_favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own favorites" ON public.user_favorites FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for price comparisons
CREATE POLICY "Users can manage their own price comparisons" ON public.price_comparisons FOR ALL USING (auth.uid() = user_id);

-- Create RLS policies for market status (public read)
CREATE POLICY "Market status is viewable by everyone" ON public.market_status_config FOR SELECT USING (true);

-- Create triggers for updated_at columns
CREATE TRIGGER update_price_comparisons_updated_at BEFORE UPDATE ON public.price_comparisons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_market_status_config_updated_at BEFORE UPDATE ON public.market_status_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default market status configurations
INSERT INTO public.market_status_config (market_name, timezone, open_time, close_time, trading_days) VALUES
('NYMEX', 'America/New_York', '18:00:00', '17:00:00', '{1,2,3,4,5}'), -- Sunday 6PM to Friday 5PM
('COMEX', 'America/New_York', '18:00:00', '17:00:00', '{1,2,3,4,5}'),
('CBOT', 'America/Chicago', '17:00:00', '13:20:00', '{1,2,3,4,5}'), -- Sunday 5PM to Friday 1:20PM
('LME', 'Europe/London', '01:00:00', '19:00:00', '{1,2,3,4,5}'), -- Monday 1AM to Friday 7PM
('ICE', 'America/New_York', '20:00:00', '18:00:00', '{1,2,3,4,5}'); -- Sunday 8PM to Friday 6PM

-- Function to automatically clean old recent activities (keep last 50 per user)
CREATE OR REPLACE FUNCTION clean_old_recent_activities()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Create trigger to automatically clean old activities
CREATE TRIGGER clean_recent_activities_trigger
  AFTER INSERT ON public.recent_activities
  FOR EACH ROW EXECUTE FUNCTION clean_old_recent_activities();