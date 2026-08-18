import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, TrendingUp, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Landing page for signup confirmation, password reset, email change, and
 * invite links — anything Supabase sends as an email link.
 *
 * Deliberately NOT the default {{ .ConfirmationURL }} flow: this project's
 * Supabase client uses flowType: 'pkce' (see integrations/supabase/client.ts),
 * and PKCE's code exchange needs the code_verifier that was stored in
 * whichever browser *requested* the link. Email links are opened from a mail
 * app, almost always in a different browser session than the one that
 * requested them — so that verifier is gone, and the exchange fails outright.
 * That was a real, live bug: signup/reset links simply didn't work unless
 * opened in the exact browser that started the flow.
 *
 * verifyOtp() with a token_hash sidesteps this entirely — it's a direct,
 * stateless verification against Supabase, no locally-stored verifier
 * needed, so it works from any device or browser. This requires the
 * Supabase Dashboard's email templates (Confirm signup, Reset Password, at
 * minimum) to be changed to link here with {{ .TokenHash }} and a `type`
 * instead of the default {{ .ConfirmationURL }} — see the project's
 * deployment notes for the exact template text.
 */
const AuthConfirm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = React.useState<'verifying' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type') as EmailOtpType | null;

      if (!tokenHash || !type) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage('This link is missing required information. Request a new one and try again.');
        }
        return;
      }

      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (cancelled) return;

      if (error || !data.session) {
        setStatus('error');
        setErrorMessage(error?.message || 'This link is invalid or has expired. Request a new one and try again.');
        return;
      }

      // Recovery credentials must never remain in the URL or browser history.
      window.history.replaceState({}, document.title, '/auth/confirm');

      if (type === 'recovery') {
        // Session is already established — ResetPassword just needs to know
        // not to look for its own code/token params.
        navigate('/reset-password?recovery=1', { replace: true });
        return;
      }

      toast({ title: 'Welcome!', description: type === 'signup' ? 'Your email is confirmed.' : 'Signed in.' });
      navigate('/', { replace: true });
    };

    void run();
    return () => { cancelled = true; };
  }, [searchParams, navigate, toast]);

  if (status === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Confirming…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-6 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="w-6 h-6 text-destructive" />
        </div>
        <div>
          <h1 className="text-lg font-semibold flex items-center justify-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />Link didn't work</h1>
          <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
        </div>
        <Button asChild className="w-full">
          <Link to="/auth">Back to sign in</Link>
        </Button>
      </Card>
    </div>
  );
};

export default AuthConfirm;
