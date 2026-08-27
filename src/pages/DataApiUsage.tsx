import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, ShieldAlert, KeyRound, Users, Activity } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface KeyReport {
  key_id: string;
  name: string;
  key_prefix: string;
  owner_email: string | null;
  owner_tier: string | null;
  owner_active: boolean | null;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
  requests_7d: number;
  requests_30d: number;
  requests_all_time: number;
}
interface UsageReport {
  summary: {
    total_keys: number;
    revoked_keys: number;
    active_keys_30d: number;
    pro_subscribers_total: number | null;
    pro_subscribers_with_key: number;
  };
  daily: { day: string; requests: number }[];
  by_resource: { resource: string; requests: number }[];
  keys: KeyReport[];
  generated_at: string;
}

const StatCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ElementType }> = ({ label, value, icon: Icon }) => (
  <Card>
    <CardContent className="flex items-center gap-3 pt-6">
      <div className="rounded-md bg-primary/10 p-2">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </CardContent>
  </Card>
);

const DataApiUsage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [report, setReport] = React.useState<UsageReport | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      if (!user) { setIsAdmin(false); return; }
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      if (!cancel) setIsAdmin(!!data);
    })();
    return () => { cancel = true; };
  }, [user]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('data-api-usage');
      if (error) throw error;
      setReport(data as UsageReport);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load usage report';
      toast({ title: 'Load failed', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

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

  const adoptionPct = report && report.summary.pro_subscribers_total
    ? Math.round((report.summary.pro_subscribers_with_key / report.summary.pro_subscribers_total) * 100)
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/exports')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Exports
          </Button>
          <Button size="sm" variant="outline" disabled={loading} onClick={load}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Data API usage</h1>
          <p className="text-sm text-muted-foreground">
            Per-key request volume, resource popularity, and Pro-subscriber adoption — for
            deciding on a paid API tier. {report && `Generated ${new Date(report.generated_at).toLocaleString()}.`}
          </p>
        </div>

        {report && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total keys" value={report.summary.total_keys} icon={KeyRound} />
              <StatCard label="Active in last 30d" value={report.summary.active_keys_30d} icon={Activity} />
              <StatCard
                label="Pro subs with a key"
                value={adoptionPct !== null ? `${report.summary.pro_subscribers_with_key} (${adoptionPct}%)` : report.summary.pro_subscribers_with_key}
                icon={Users}
              />
              <StatCard label="Revoked keys" value={report.summary.revoked_keys} icon={KeyRound} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Requests per day (last 30 days)</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(d: string) => d.slice(5)}
                      tick={{ fontSize: 11 }}
                      interval={Math.ceil(report.daily.length / 10)}
                    />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                    />
                    <Bar dataKey="requests" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">By resource (last 30 days)</CardTitle>
              </CardHeader>
              <CardContent>
                {report.by_resource.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No requests recorded in the last 30 days.</p>
                ) : (
                  <div className="space-y-2">
                    {report.by_resource.map((r) => {
                      const max = report.by_resource[0]?.requests || 1;
                      return (
                        <div key={r.resource} className="flex items-center gap-3 text-sm">
                          <span className="w-28 shrink-0 font-mono text-xs">{r.resource}</span>
                          <div className="h-2 flex-1 rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-primary"
                              style={{ width: `${Math.max(4, (r.requests / max) * 100)}%` }}
                            />
                          </div>
                          <span className="w-14 shrink-0 text-right text-muted-foreground">{r.requests}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Keys</CardTitle>
                <CardDescription>Sorted by requests in the last 30 days.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Key</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead className="text-right">7d</TableHead>
                        <TableHead className="text-right">30d</TableHead>
                        <TableHead className="text-right">All time</TableHead>
                        <TableHead>Last used</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.keys.map((k) => (
                        <TableRow key={k.key_id}>
                          <TableCell>
                            <div className="font-medium">{k.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{k.key_prefix}…</div>
                          </TableCell>
                          <TableCell className="text-sm">{k.owner_email ?? '—'}</TableCell>
                          <TableCell className="text-sm capitalize">{k.owner_tier ?? '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{k.requests_7d}</TableCell>
                          <TableCell className="text-right tabular-nums">{k.requests_30d}</TableCell>
                          <TableCell className="text-right tabular-nums">{k.requests_all_time}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'never'}
                          </TableCell>
                          <TableCell>
                            {k.revoked ? (
                              <Badge variant="secondary">Revoked</Badge>
                            ) : k.owner_active === false ? (
                              <Badge variant="outline">Inactive sub</Badge>
                            ) : (
                              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">Active</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {report.keys.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                            No API keys created yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default DataApiUsage;
