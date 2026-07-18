import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

type Status = 'live' | 'eod' | 'stale' | 'dead';
interface AuditRow {
  name: string;
  source: 'cpa' | 'oilpriceapi';
  category: string;
  symbol: string;
  price: number | null;
  lastTickAge_h: number | null;
  status: Status;
  error?: string;
}

const statusVariant = (s: Status) => {
  switch (s) {
    case 'live': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'eod': return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    case 'stale': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'dead': return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  }
};

const recommendation = (s: Status) => ({
  live: 'Keep — live',
  eod: 'Keep, flag EOD',
  stale: 'Demote to reference',
  dead: 'Cut from catalog',
}[s]);

const CatalogAudit: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [rows, setRows] = React.useState<AuditRow[]>([]);
  const [counts, setCounts] = React.useState<Record<Status, number> | null>(null);
  const [auditedAt, setAuditedAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<'name' | 'status' | 'lastTickAge_h'>('status');

  // Verify admin role server-side via user_roles RLS.
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

  // Load most-recent snapshot from system_metrics
  const loadLatest = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('system_metrics')
      .select('metadata, created_at')
      .eq('metric_name', 'premium_freshness')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      toast({ title: 'Could not load snapshot', description: error.message, variant: 'destructive' });
      return;
    }
    if (data?.metadata) {
      const md = data.metadata as { rows?: AuditRow[]; counts?: Record<Status, number>; audited_at?: string };
      setRows(md.rows ?? []);
      setCounts(md.counts ?? null);
      setAuditedAt(md.audited_at ?? data.created_at);
    }
  }, [toast]);

  React.useEffect(() => {
    if (isAdmin) loadLatest();
  }, [isAdmin, loadLatest]);

  const runAudit = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('audit-premium-freshness');
      if (error) throw error;
      const payload = data as { rows: AuditRow[]; counts: Record<Status, number>; audited_at: string };
      setRows(payload.rows);
      setCounts(payload.counts);
      setAuditedAt(payload.audited_at);
      toast({ title: 'Audit complete', description: `${payload.rows.length} symbols sampled` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Audit failed';
      toast({ title: 'Audit failed', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    const header = ['name', 'source', 'category', 'symbol', 'price', 'lastTickAge_h', 'status', 'recommendation', 'error'];
    const lines = [header.join(',')];
    for (const r of sorted) {
      lines.push([
        JSON.stringify(r.name),
        r.source,
        r.category,
        r.symbol,
        r.price ?? '',
        r.lastTickAge_h?.toFixed(2) ?? '',
        r.status,
        JSON.stringify(recommendation(r.status)),
        JSON.stringify(r.error ?? ''),
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catalog-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sorted = React.useMemo(() => {
    const order: Record<Status, number> = { dead: 0, stale: 1, eod: 2, live: 3 };
    return [...rows].sort((a, b) => {
      if (sortKey === 'status') return order[a.status] - order[b.status];
      if (sortKey === 'lastTickAge_h') return (b.lastTickAge_h ?? 1e9) - (a.lastTickAge_h ?? 1e9);
      return a.name.localeCompare(b.name);
    });
  }, [rows, sortKey]);

  if (isAdmin === null) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
              <CardTitle>Admin only</CardTitle>
            </div>
            <CardDescription>
              The catalog freshness audit is restricted to admin accounts.
              {profile?.email ? ` You're signed in as ${profile.email}.` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to="/dashboard"><ArrowLeft className="w-4 h-4 mr-2" />Back to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-4 h-4 mr-2" />Dashboard
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="w-4 h-4 mr-2" />Export CSV
          </Button>
          <Button size="sm" onClick={runAudit} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Auditing…' : 'Run audit now'}
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Premium catalog freshness audit</CardTitle>
          <CardDescription>
            Snapshots upstream API freshness for every premium symbol. Use it to decide what to keep, badge as EOD, demote to reference, or cut.
            {auditedAt && <span className="block mt-1 text-xs">Last snapshot: {new Date(auditedAt).toLocaleString()}</span>}
          </CardDescription>
        </CardHeader>
        {counts && (
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['live', 'eod', 'stale', 'dead'] as Status[]).map((s) => (
              <div key={s} className={`rounded-lg border p-3 ${statusVariant(s)}`}>
                <div className="text-2xl font-bold">{counts[s] ?? 0}</div>
                <div className="text-xs uppercase tracking-wider opacity-80">{s}</div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Sort:</span>
            {(['status', 'name', 'lastTickAge_h'] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={sortKey === k ? 'default' : 'outline'}
                onClick={() => setSortKey(k)}
                className="h-7 px-2"
              >
                {k === 'lastTickAge_h' ? 'age' : k}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Age (h)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recommendation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    No snapshot yet. Click "Run audit now" to sample upstream APIs.
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((r) => (
                <TableRow key={`${r.source}-${r.symbol}-${r.name}`}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.source}</TableCell>
                  <TableCell className="text-xs font-mono">{r.symbol}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.price != null ? r.price.toFixed(2) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.lastTickAge_h != null ? r.lastTickAge_h.toFixed(1) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`uppercase text-2xs ${statusVariant(r.status)}`}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {recommendation(r.status)}
                    {r.error && <span className="block text-rose-400 mt-0.5">{r.error}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default CatalogAudit;