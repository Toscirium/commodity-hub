import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompleteEtoroConnection } from '@/hooks/useEtoroTrading';

/**
 * Landing point for eToro's OAuth redirect (ETORO_REDIRECT_URI). Forwards
 * the returned code/state to etoro-auth's callback action — see that
 * function for the actual token exchange and ID-token verification. This
 * page does no PKCE/crypto itself; it's just the browser hop back from
 * eToro's own login/consent screen.
 */
const EtoroCallback: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const complete = useCompleteEtoroConnection();
  const ranRef = React.useRef(false);

  React.useEffect(() => {
    if (ranRef.current) return; // StrictMode/re-render guard — the code is one-time-use at eToro
    const code = params.get('code');
    const state = params.get('state');
    const oauthError = params.get('error');
    if (oauthError) {
      complete.reset();
      return;
    }
    if (!code || !state) return;
    ranRef.current = true;
    complete.mutate({ code, state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const oauthError = params.get('error_description') ?? params.get('error');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm text-center space-y-4">
        {oauthError ? (
          <>
            <XCircle className="mx-auto h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">eToro didn't complete the connection</p>
            <p className="text-xs text-muted-foreground">{oauthError}</p>
          </>
        ) : complete.isError ? (
          <>
            <XCircle className="mx-auto h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Couldn't finish connecting your eToro account</p>
            <p className="text-xs text-muted-foreground">{(complete.error as Error).message}</p>
          </>
        ) : complete.isSuccess ? (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-[hsl(var(--success))]" />
            <p className="text-sm font-medium">eToro demo account connected</p>
          </>
        ) : (
          <>
            <Loader className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Finishing eToro connection…</p>
          </>
        )}
        <Button onClick={() => navigate('/etoro-trading')} disabled={complete.isPending}>
          {complete.isSuccess ? 'Go to eToro Trading' : 'Back to eToro Trading'}
        </Button>
      </div>
    </div>
  );
};

export default EtoroCallback;
