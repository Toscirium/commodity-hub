import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { downloadCsv } from '@/utils/csvExport';
import PremiumPaywall from '@/components/PremiumPaywall';

type ApiKey = { id: string; name: string; key_prefix: string; last_used_at: string | null; revoked_at: string | null; created_at: string };
type Schedule = { id: string; name: string; dataset: 'portfolio' | 'watchlists'; format: 'csv' | 'xlsx'; frequency: string; enabled: boolean };

const DataExports: React.FC = () => {
  const auth = useAuth(); const navigate = useNavigate(); const isPro = auth?.isPro ?? false;
  const [keys, setKeys] = useState<ApiKey[]>([]); const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [keyName, setKeyName] = useState(''); const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [scheduleName, setScheduleName] = useState('Weekly portfolio'); const [dataset, setDataset] = useState<'portfolio' | 'watchlists'>('portfolio');
  const [format, setFormat] = useState<'csv' | 'xlsx'>('xlsx'); const [frequency, setFrequency] = useState('weekly'); const [busy, setBusy] = useState(false); const [paywall, setPaywall] = useState(false);
  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('export-center', { body });
    if (error || data?.error) throw new Error(data?.error ?? 'Request failed'); return data;
  };
  const load = async () => { if (!isPro) return; try { const data = await invoke({ action: 'list' }); setKeys(data.keys); setSchedules(data.schedules); } catch { /* endpoint may not be deployed yet */ } };
  useEffect(() => { load(); }, [isPro]);
  const exportData = async (kind: 'portfolio' | 'watchlists', kindFormat: 'csv' | 'xlsx') => {
    if (!auth?.user) return; setBusy(true);
    try {
      const query = kind === 'portfolio'
        ? await supabase.from('portfolio_positions').select('commodity_name,quantity,entry_price,entry_date,notes,created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false })
        : await supabase.from('watchlists').select('name,created_at,watchlist_items(commodity_name,commodity_symbol,position)').eq('user_id', auth.user.id).order('created_at', { ascending: false });
      if (query.error) throw query.error;
      const rows = (query.data ?? []) as Record<string, unknown>[];
      if (kindFormat === 'csv') downloadCsv(`${kind}-${new Date().toISOString().slice(0, 10)}`, Object.keys(rows[0] ?? { empty: '' }), rows.map(Object.values));
      else { const sheet = XLSX.utils.json_to_sheet(rows); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, kind); XLSX.writeFile(book, `${kind}-${new Date().toISOString().slice(0, 10)}.xlsx`); }
    } finally { setBusy(false); }
  };
  const createKey = async () => { if (!keyName.trim()) return; setBusy(true); try { const data = await invoke({ action: 'create_key', name: keyName }); setRevealedKey(data.rawKey); setKeyName(''); await load(); } finally { setBusy(false); } };
  const revoke = async (id: string) => { await invoke({ action: 'revoke_key', id }); await load(); };
  const saveSchedule = async () => { setBusy(true); try { await invoke({ action: 'save_schedule', schedule: { name: scheduleName, dataset, format, frequency } }); await load(); } finally { setBusy(false); } };
  if (!isPro) return <div className="min-h-screen bg-background"><div className="mx-auto max-w-3xl px-4 py-8"><Button variant="ghost" asChild><Link to="/account-settings"><ArrowLeft className="mr-2 h-4 w-4" />Account</Link></Button><Card className="mt-5 border-primary/30"><CardHeader><CardTitle>Exports & Data API</CardTitle><CardDescription>Pro users can export their data, create API credentials, and save scheduled report definitions.</CardDescription></CardHeader><CardContent><Button onClick={() => setPaywall(true)}>Upgrade to Pro</Button></CardContent></Card><PremiumPaywall open={paywall} onOpenChange={setPaywall} /></div></div>;
  return <div className="min-h-screen bg-background"><div className="mx-auto max-w-4xl space-y-6 px-4 py-6"><Button variant="ghost" size="sm" onClick={() => navigate('/account-settings')}><ArrowLeft className="mr-2 h-4 w-4" />Account</Button><div><h1 className="text-2xl font-semibold">Exports & Data API</h1><p className="text-sm text-muted-foreground">Portable exports and API access for your saved market workspace.</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" />Download now</CardTitle><CardDescription>Exports include only data in your account.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => exportData('portfolio', 'xlsx')}>Portfolio XLSX</Button><Button variant="outline" disabled={busy} onClick={() => exportData('portfolio', 'csv')}>Portfolio CSV</Button><Button variant="outline" disabled={busy} onClick={() => exportData('watchlists', 'xlsx')}>Watchlists XLSX</Button></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />API keys</CardTitle><CardDescription>Keys grant access to your portfolio, watchlists, and market data (COT positioning, EIA fundamentals) at <code>/functions/v1/data-api?resource=portfolio|watchlists|cot|fundamentals</code>. 60 requests/minute per key. Copy a key now; it cannot be shown again. Full reference at <Link className="underline" to="/developers">/developers</Link>.</CardDescription></CardHeader><CardContent className="space-y-3">{revealedKey && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 font-mono text-xs break-all">{revealedKey}</div>}<div className="flex gap-2"><Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name, e.g. Finance dashboard" maxLength={80} /><Button disabled={busy} onClick={createKey}><Plus className="mr-1 h-4 w-4" />Create</Button></div>{keys.map((key) => <div className="flex items-center justify-between rounded-md border p-3 text-sm" key={key.id}><div><p className="font-medium">{key.name}</p><p className="font-mono text-xs text-muted-foreground">{key.key_prefix}… · {key.last_used_at ? `used ${new Date(key.last_used_at).toLocaleDateString()}` : 'never used'}</p></div>{key.revoked_at ? <Badge variant="secondary">Revoked</Badge> : <Button size="sm" variant="ghost" onClick={() => revoke(key.id)}><Trash2 className="mr-1 h-4 w-4" />Revoke</Button>}</div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>Scheduled reports</CardTitle><CardDescription>Save a recurring report definition. A delivery worker can use these settings to generate and distribute reports on the selected cadence.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-2 sm:grid-cols-4"><Input value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} /><select className="rounded-md border bg-background px-3" value={dataset} onChange={(e) => setDataset(e.target.value as typeof dataset)}><option value="portfolio">Portfolio</option><option value="watchlists">Watchlists</option></select><select className="rounded-md border bg-background px-3" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}><option value="xlsx">XLSX</option><option value="csv">CSV</option></select><select className="rounded-md border bg-background px-3" value={frequency} onChange={(e) => setFrequency(e.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div><Button disabled={busy} onClick={saveSchedule}><RefreshCw className="mr-1 h-4 w-4" />Save schedule</Button>{schedules.map((s) => <div className="rounded-md border p-3 text-sm" key={s.id}>{s.name} · {s.dataset} · {s.format.toUpperCase()} · {s.frequency}</div>)}</CardContent></Card>
  </div></div>;
};
export default DataExports;
