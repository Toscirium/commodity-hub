import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { inspectSupabaseAuthStorage, purgeMalformedSupabaseTokens, supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type Status = 'ok' | 'warn' | 'error' | 'idle';

interface Row {
  label: string;
  value: string;
  status: Status;
}

const SUPABASE_URL = 'https://kcxhsmlqqyarhlmcapmj.supabase.co';

const StatusDot: React.FC<{ status: Status }> = ({ status }) => {
  const cls =
    status === 'ok'
      ? 'bg-emerald-500'
      : status === 'warn'
      ? 'bg-amber-500'
      : status === 'error'
      ? 'bg-destructive'
      : 'bg-muted-foreground/40';
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} aria-hidden />;
};

export const AuthHealthPanel: React.FC = () => {
  const auth = useAuth();
  const [open, setOpen] = React.useState(false);
  const [lastEvent, setLastEvent] = React.useState<string>('—');
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [tokenCheck, setTokenCheck] = React.useState(inspectSupabaseAuthStorage());
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setLastEvent(`${event}${session?.user?.email ? ` · ${session.user.email}` : ''}`);
      setTokenCheck(inspectSupabaseAuthStorage());
    });

    // Capture latest auth errors broadcast from AuthContext via toasts is not
    // available here, so we intercept errors thrown by signInWithOAuth/Password
    // by listening to a custom window event the context can dispatch.
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      setLastError(detail?.message || 'Unknown auth error');
    };
    window.addEventListener('auth:error', handler as EventListener);

    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('auth:error', handler as EventListener);
    };
  }, []);

  const refresh = () => {
    purgeMalformedSupabaseTokens();
    setTokenCheck(inspectSupabaseAuthStorage());
    setTick((t) => t + 1);
  };

  const rows: Row[] = React.useMemo(() => {
    const r: Row[] = [];
    r.push({
      label: 'Supabase URL',
      value: SUPABASE_URL,
      status: SUPABASE_URL ? 'ok' : 'error',
    });
    r.push({
      label: 'Client initialized',
      value: supabase ? 'yes' : 'no',
      status: supabase ? 'ok' : 'error',
    });
    r.push({
      label: 'Auth context',
      value: auth ? 'mounted' : 'not mounted',
      status: auth ? 'ok' : 'warn',
    });
    r.push({
      label: 'Loading',
      value: auth?.loading ? 'true' : 'false',
      status: auth?.loading ? 'warn' : 'ok',
    });
    r.push({
      label: 'User',
      value: auth?.user?.email || '— (signed out)',
      status: auth?.user ? 'ok' : 'idle',
    });
    r.push({
      label: 'Session',
      value: auth?.session ? 'active' : 'none',
      status: auth?.session ? 'ok' : 'idle',
    });
    r.push({
      label: 'Stored token',
      value: tokenCheck.found
        ? tokenCheck.valid
          ? 'present · valid'
          : `present · INVALID (${tokenCheck.reason})`
        : 'none',
      status: tokenCheck.found ? (tokenCheck.valid ? 'ok' : 'error') : 'idle',
    });
    r.push({
      label: 'Last auth event',
      value: lastEvent,
      status: 'idle',
    });
    r.push({
      label: 'Last auth error',
      value: lastError || '—',
      status: lastError ? 'error' : 'ok',
    });
    r.push({
      label: 'Origin',
      value: typeof window !== 'undefined' ? window.location.origin : '—',
      status: 'idle',
    });
    return r;
    // tick included so Refresh re-evaluates `auth` snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, auth?.user, auth?.session, auth?.loading, tokenCheck, lastEvent, lastError, tick]);

  const overallError = rows.some((r) => r.status === 'error');
  const overallWarn = rows.some((r) => r.status === 'warn');

  return (
    <Card className="p-3 sm:p-4 bg-card/60 border border-border/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {overallError ? (
            <AlertCircle className="w-4 h-4 text-destructive" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          )}
          <span className="text-sm font-medium">Auth status</span>
          <Badge
            variant={overallError ? 'destructive' : 'secondary'}
            className="text-[10px] uppercase tracking-wide"
          >
            {overallError ? 'issue detected' : overallWarn ? 'warnings' : 'healthy'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={(e) => {
              e.stopPropagation();
              refresh();
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          {open ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-1.5">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-start justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2 text-muted-foreground min-w-[7.5rem]">
                <StatusDot status={row.status} />
                <span>{row.label}</span>
              </div>
              <span
                className={`text-right break-all ${
                  row.status === 'error' ? 'text-destructive' : 'text-foreground'
                }`}
              >
                {row.value}
              </span>
            </div>
          ))}
          <p className="pt-2 text-[10px] text-muted-foreground">
            If "Stored token" is INVALID, click Refresh after reloading — the
            client clears bad tokens on boot.
          </p>
        </div>
      )}
    </Card>
  );
};

export default AuthHealthPanel;