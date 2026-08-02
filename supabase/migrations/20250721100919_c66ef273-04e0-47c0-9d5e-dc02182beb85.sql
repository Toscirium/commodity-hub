-- Create IBKR credentials table for storing encrypted user credentials
CREATE TABLE public.ibkr_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username_encrypted TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  gateway TEXT NOT NULL DEFAULT 'paper',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id) -- Each user can only have one set of IBKR credentials
);

-- Enable Row Level Security
ALTER TABLE public.ibkr_credentials ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own IBKR credentials" 
ON public.ibkr_credentials 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own IBKR credentials" 
ON public.ibkr_credentials 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own IBKR credentials" 
ON public.ibkr_credentials 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own IBKR credentials" 
ON public.ibkr_credentials 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ibkr_credentials_updated_at
BEFORE UPDATE ON public.ibkr_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();