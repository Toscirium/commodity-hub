import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Star, Trash2, Lock, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useAvailableCommodities } from '@/hooks/useCommodityData';
import {
  useWatchlists, useWatchlistItems, useCreateWatchlist, useDeleteWatchlist,
  useAddWatchlistItem, useRemoveWatchlistItem,
} from '@/hooks/useWatchlists';
import { limitsFor } from '@/utils/tiers';
import PremiumPaywall from '@/components/PremiumPaywall';
import { downloadCsv } from '@/utils/csvExport';

const Watchlists: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const tier = auth?.tier ?? 'free';
  const limits = limitsFor(tier);

  const { data: commodities = [] } = useAvailableCommodities({ lightweight: true });
  const { data: watchlists = [], isLoading } = useWatchlists();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: items = [] } = useWatchlistItems(selectedId);
  const createWl = useCreateWatchlist();
  const deleteWl = useDeleteWatchlist();
  const addItem = useAddWatchlistItem();
  const removeItem = useRemoveWatchlistItem();

  const [createOpen, setCreateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [pickCommodity, setPickCommodity] = useState('');

  useEffect(() => {
    if (!selectedId && watchlists.length > 0) setSelectedId(watchlists[0].id);
  }, [watchlists, selectedId]);

  const priceByName = useMemo(() => {
    const m = new Map<string, { price: number; changePct: number }>();
    for (const c of commodities) m.set(c.name, { price: c.price, changePct: c.changePercent });
    return m;
  }, [commodities]);

  const atListLimit = watchlists.length >= limits.watchlists;
  const atItemLimit = items.length >= limits.watchlistItems;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    if (atListLimit) { setPaywallOpen(true); return; }
    await createWl.mutateAsync({ name: newName.trim() });
    setNewName('');
    setCreateOpen(false);
  };

  const handleAdd = async () => {
    if (!pickCommodity || !selectedId) return;
    if (atItemLimit) { setPaywallOpen(true); return; }
    const c = commodities.find((c) => c.name === pickCommodity);
    await addItem.mutateAsync({
      watchlistId: selectedId,
      commodity_name: pickCommodity,
      commodity_symbol: c?.symbol ?? null,
    });
    setPickCommodity('');
    setAddOpen(false);
  };

  const selected = watchlists.find((w) => w.id === selectedId);

  const handleExportCsv = () => {
    if (!limits.csvExport) { setPaywallOpen(true); return; }
    if (!selected) return;
    downloadCsv(
      `${selected.name}-watchlist.csv`,
      ['Commodity', 'Symbol', 'Price', 'Change %'],
      items.map((it) => {
        const live = priceByName.get(it.commodity_name);
        return [
          it.commodity_name,
          it.commodity_symbol ?? '',
          live?.price ?? '',
          live ? live.changePct.toFixed(2) : '',
        ];
      }),
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Star className="w-6 h-6 text-primary" /> Watchlists
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {watchlists.length}/{Number.isFinite(limits.watchlists) ? limits.watchlists : '∞'} watchlists ·
              up to {Number.isFinite(limits.watchlistItems) ? limits.watchlistItems : '∞'} commodities each
            </p>
          </div>
          <Button onClick={() => atListLimit ? setPaywallOpen(true) : setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {atListLimit ? 'Upgrade for more' : 'New watchlist'}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : watchlists.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No watchlists yet</CardTitle>
              <CardDescription>Create your first one to start tracking commodities.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">My Watchlists</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {watchlists.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setSelectedId(w.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedId === w.id ? 'bg-primary/10 border-primary/50' : 'border-border hover:bg-muted/50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{w.name}</span>
                      {!w.is_default && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); deleteWl.mutate(w.id); if (selectedId === w.id) setSelectedId(null); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <div className="lg:col-span-2">
              {selected && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{selected.name}</CardTitle>
                      <CardDescription>{items.length}/{Number.isFinite(limits.watchlistItems) ? limits.watchlistItems : '∞'} commodities</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleExportCsv}
                        disabled={items.length === 0}
                        title={limits.csvExport ? 'Export CSV' : 'Upgrade to export CSV'}
                      >
                        {limits.csvExport ? <Download className="w-3.5 h-3.5 mr-1.5" /> : <Lock className="w-3.5 h-3.5 mr-1.5" />}
                        CSV
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => atItemLimit ? setPaywallOpen(true) : setAddOpen(true)}>
                        {atItemLimit ? <><Lock className="w-3.5 h-3.5 mr-1.5" />Upgrade</> : <><Plus className="w-4 h-4 mr-1.5" />Add</>}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No commodities yet — add your first.</p>
                    ) : (
                      <div className="space-y-2">
                        {items.map((it) => {
                          const live = priceByName.get(it.commodity_name);
                          return (
                            <div key={it.id} className="flex items-center gap-3 p-3 rounded border hover:bg-muted/40">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{it.commodity_name}</p>
                                {it.commodity_symbol && <p className="text-xs text-muted-foreground">{it.commodity_symbol}</p>}
                              </div>
                              <div className="text-right">
                                <p className="font-semibold tabular-nums">${live?.price?.toFixed(2) ?? '—'}</p>
                                {live && (
                                  <Badge variant={live.changePct >= 0 ? 'default' : 'secondary'} className={live.changePct >= 0 ? 'bg-emerald-500/15 text-emerald-500' : 'bg-orange-500/15 text-orange-500'}>
                                    {live.changePct >= 0 ? '+' : ''}{live.changePct.toFixed(2)}%
                                  </Badge>
                                )}
                              </div>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem.mutate({ id: it.id, watchlistId: selected.id })}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New watchlist</DialogTitle>
            <DialogDescription>Group related commodities for quick tracking.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input placeholder="e.g. Energy" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createWl.isPending || !newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add commodity</DialogTitle>
          </DialogHeader>
          <Select value={pickCommodity} onValueChange={setPickCommodity}>
            <SelectTrigger><SelectValue placeholder="Choose a commodity" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {commodities.map((c) => (
                <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!pickCommodity || addItem.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

export default Watchlists;