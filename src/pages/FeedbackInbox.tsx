import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, ShieldAlert, Check, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface FeedbackRow {
  id: string;
  user_id: string | null;
  message: string;
  contact_email: string | null;
  route: string | null;
  user_agent: string | null;
  app_version: string | null;
  resolved_at: string | null;
  created_at: string;
}

const FeedbackInbox: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [rows, setRows] = React.useState<FeedbackRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [showResolved, setShowResolved] = React.useState(false);

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      if (!user) { setIsAdmin(false); return; }
      const { data } = await supabase
        .from('user_roles').select('role')
        .eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (!cancel) setIsAdmin(!!data);
    })();
    return () => { cancel = true; };
  }, [user]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('id,user_id,message,contact_email,route,user_agent,app_version,resolved_at,created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data ?? []) as FeedbackRow[]);
    } catch (err) {
      toast({
        title: 'Could not load feedback',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const resolve = async (id: string) => {
    const { error } = await supabase
      .from('feedback').update({ resolved_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      toast({ title: 'Could not resolve', description: error.message, variant: 'destructive' });
      return;
    }
    await load();
  };

  if (isAdmin === null) return null;
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Admin only</CardTitle>
            <CardDescription>This page requires an admin role.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const visible = showResolved ? rows : rows.filter((r) => !r.resolved_at);
  const openCount = rows.filter((r) => !r.resolved_at).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1000px] space-y-5 px-4 py-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowResolved((v) => !v)}>
              {showResolved ? 'Hide resolved' : 'Show resolved'}
            </Button>
            <Button size="sm" variant="outline" disabled={loading} onClick={load}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Feedback</h1>
          <p className="text-sm text-muted-foreground">
            {openCount} open{rows.length !== openCount && ` · ${rows.length - openCount} resolved`}
          </p>
        </div>

        {visible.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {showResolved ? 'Nothing here yet.' : 'No open feedback.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visible.map((r) => (
              <Card key={r.id} className={r.resolved_at ? 'opacity-60' : undefined}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{new Date(r.created_at).toLocaleString()}</span>
                      {r.route && <Badge variant="outline" className="font-mono text-[10px]">{r.route}</Badge>}
                      <Badge variant="secondary" className="text-[10px]">
                        {r.user_id ? 'signed in' : 'anonymous'}
                      </Badge>
                      {r.app_version && (
                        <span className="font-mono text-[10px]">v{r.app_version}</span>
                      )}
                    </div>
                    {!r.resolved_at && (
                      <Button size="sm" variant="ghost" onClick={() => resolve(r.id)}>
                        <Check className="mr-1 h-4 w-4" /> Resolve
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="whitespace-pre-wrap text-sm">{r.message}</p>
                  {r.contact_email && (
                    <p className="text-xs text-muted-foreground">
                      Reply to:{' '}
                      <a className="underline" href={`mailto:${r.contact_email}`}>{r.contact_email}</a>
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackInbox;
