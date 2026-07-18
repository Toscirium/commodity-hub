-- Create tables for Trading Community feature
CREATE TABLE public.forums (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  commodity_group TEXT NOT NULL, -- energy, metals, grains, livestock, softs, other
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.forum_topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  forum_id UUID NOT NULL REFERENCES public.forums(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  locked BOOLEAN NOT NULL DEFAULT false,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.forum_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tables for Expert Insights feature
CREATE TABLE public.expert_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expert_name TEXT NOT NULL,
  expert_title TEXT,
  commodity_focus TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  prediction_timeframe TEXT, -- weekly, monthly, quarterly
  bullish_bearish TEXT CHECK (bullish_bearish IN ('bullish', 'bearish', 'neutral')),
  confidence_level INTEGER CHECK (confidence_level >= 1 AND confidence_level <= 5),
  published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tables for Learning Hub feature
CREATE TABLE public.tutorial_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.tutorials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.tutorial_categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  difficulty_level TEXT NOT NULL CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  estimated_time_minutes INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.glossary_terms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  term TEXT NOT NULL UNIQUE,
  definition TEXT NOT NULL,
  category TEXT,
  examples TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tables for Market Sentiment feature
CREATE TABLE public.sentiment_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  commodity_name TEXT NOT NULL,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('bullish', 'bearish')),
  confidence INTEGER NOT NULL CHECK (confidence >= 1 AND confidence <= 5),
  reasoning TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, commodity_name)
);

CREATE TABLE public.sentiment_aggregates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  commodity_name TEXT NOT NULL UNIQUE,
  bullish_votes INTEGER NOT NULL DEFAULT 0,
  bearish_votes INTEGER NOT NULL DEFAULT 0,
  total_votes INTEGER NOT NULL DEFAULT 0,
  average_confidence DECIMAL(3,2),
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.forums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expert_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutorial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutorials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glossary_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentiment_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentiment_aggregates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for forums (public read, authenticated users can post)
CREATE POLICY "Forums are viewable by everyone" ON public.forums FOR SELECT USING (true);
CREATE POLICY "Forum topics are viewable by everyone" ON public.forum_topics FOR SELECT USING (true);
CREATE POLICY "Forum posts are viewable by everyone" ON public.forum_posts FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create topics" ON public.forum_topics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own topics" ON public.forum_topics FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own topics" ON public.forum_topics FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create posts" ON public.forum_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own posts" ON public.forum_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own posts" ON public.forum_posts FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for expert insights (public read)
CREATE POLICY "Expert insights are viewable by everyone" ON public.expert_insights FOR SELECT USING (true);

-- Create RLS policies for learning hub (public read)
CREATE POLICY "Tutorial categories are viewable by everyone" ON public.tutorial_categories FOR SELECT USING (true);
CREATE POLICY "Tutorials are viewable by everyone" ON public.tutorials FOR SELECT USING (true);
CREATE POLICY "Glossary terms are viewable by everyone" ON public.glossary_terms FOR SELECT USING (true);

-- Create RLS policies for sentiment (authenticated users can vote, everyone can read aggregates)
CREATE POLICY "Users can manage their own sentiment votes" ON public.sentiment_votes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Sentiment aggregates are viewable by everyone" ON public.sentiment_aggregates FOR SELECT USING (true);

-- Create triggers for updated_at columns
CREATE TRIGGER update_forums_updated_at BEFORE UPDATE ON public.forums FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_forum_topics_updated_at BEFORE UPDATE ON public.forum_topics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_forum_posts_updated_at BEFORE UPDATE ON public.forum_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tutorials_updated_at BEFORE UPDATE ON public.tutorials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_glossary_terms_updated_at BEFORE UPDATE ON public.glossary_terms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default forums for each commodity group
INSERT INTO public.forums (commodity_group, name, description) VALUES
('energy', 'Energy Trading', 'Discuss crude oil, natural gas, and energy commodity trading'),
('metals', 'Metals Trading', 'Discuss gold, silver, copper, and other metals trading'),
('grains', 'Grains Trading', 'Discuss wheat, corn, soybeans, and other grain trading'),
('livestock', 'Livestock Trading', 'Discuss cattle, hogs, and livestock trading'),
('softs', 'Soft Commodities', 'Discuss coffee, sugar, cocoa, and other soft commodities'),
('other', 'Other Commodities', 'Discuss miscellaneous commodity trading topics');

-- Insert default tutorial categories
INSERT INTO public.tutorial_categories (name, description, sort_order) VALUES
('Basics', 'Fundamental concepts of commodity trading', 1),
('Technical Analysis', 'Chart reading and technical indicators', 2),
('Risk Management', 'Position sizing and risk control strategies', 3),
('Market Fundamentals', 'Supply and demand analysis', 4),
('Advanced Strategies', 'Complex trading techniques and strategies', 5);

-- Function to update sentiment aggregates
CREATE OR REPLACE FUNCTION update_sentiment_aggregates()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Create trigger to update sentiment aggregates
CREATE TRIGGER update_sentiment_aggregates_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.sentiment_votes
  FOR EACH ROW EXECUTE FUNCTION update_sentiment_aggregates();