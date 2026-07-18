import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Plus, Trash2, Sparkles, Lock, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAvailableCommodities } from "@/hooks/useCommodityData";
import {
  usePriceAlerts,
  useCreatePriceAlert,
  useToggleAlert,
  useDeleteAlert,
} from "@/hooks/usePriceAlerts";
import PremiumPaywall from "@/components/PremiumPaywall";
import { limitsFor, tierAtLeast, type Tier } from "@/utils/tiers";
import { downloadCsv } from "@/utils/csvExport";

type AlertType = "price" | "pct_move" | "volatility_band" | "spread" | "news_keyword" | "spread_signal" | "carry_signal" | "seasonality_signal";

const ALERT_TYPE_META: Record<AlertType, { label: string; desc: string; minTier: Tier }> = {
  price: { label: "Price threshold", desc: "Fires when price crosses an absolute level.", minTier: "free" },
  pct_move: { label: "% move", desc: "Fires when % change over a window exceeds a threshold.", minTier: "premium" },
  volatility_band: { label: "Volatility band", desc: "Fires when price exits an N-sigma rolling band.", minTier: "pro" },
  spread: { label: "Spread level", desc: "Fires when a spread (e.g. Brent–WTI) crosses a target.", minTier: "pro" },
  spread_signal: { label: "Historical spread extreme", desc: "Fires when a calendar, crack, or ratio spread reaches a z-score extreme.", minTier: "pro" },
  carry_signal: { label: "Carry extreme", desc: "Fires when annualized contango or backwardation reaches a threshold.", minTier: "pro" },
  seasonality_signal: { label: "Seasonal pattern", desc: "Fires when this month's historical return and hit rate meet your criteria.", minTier: "pro" },
  news_keyword: { label: "News keyword", desc: "Fires when a keyword hits the news feed.", minTier: "pro" },
};

const PriceAlertsPage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { toast } = useToast();
  const tier = auth?.tier ?? 'free';
  const isPremium = tier !== 'free';
  const { data: alerts = [], isLoading } = usePriceAlerts();
  const { data: commodities = [] } = useAvailableCommodities();
  const createAlert = useCreatePriceAlert();
  const toggleAlert = useToggleAlert();
  const deleteAlert = useDeleteAlert();

  const [open, setOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [alertType, setAlertType] = useState<AlertType>("price");
  const [form, setForm] = useState({
    commodity_name: "",
    condition: "above" as "above" | "below",
    target_price: "",
    cooldown_minutes: 60,
    note: "",
    // pct_move
    pct_window: "24h" as "1h" | "24h" | "7d",
    pct_threshold: "5",
    // volatility_band
    vol_window_days: "20",
    vol_std_devs: "2",
    // spread
    spread_name: "brent_wti",
    spread_target: "",
    // news_keyword
    keywords: "",
    signal_id: "crack-321",
    signal_direction: "either",
    signal_threshold: "1.5",
    seasonality_return: "1",
    seasonality_hit_rate: "60",
    seasonality_id: "wti",
  });

  const canUseType = (t: AlertType) => tierAtLeast(tier, ALERT_TYPE_META[t].minTier);

  const activeCount = alerts.filter((a) => a.is_active).length;
  const limit = limitsFor(tier).activeAlerts;
  const atLimit = activeCount >= limit;

  const handleCreateClick = () => {
    if (atLimit && !isPremium) {
      setPaywallOpen(true);
      return;
    }
    if (atLimit) {
      toast({
        title: "Alert limit reached",
        description: `You have ${activeCount}/${limit} active alerts. Disable or delete one to add another.`,
      });
      return;
    }
    setOpen(true);
  };

  const resetForm = () =>
    setForm({
      commodity_name: "",
      condition: "above",
      target_price: "",
      cooldown_minutes: 60,
      note: "",
      pct_window: "24h",
      pct_threshold: "5",
      vol_window_days: "20",
      vol_std_devs: "2",
      spread_name: "brent_wti",
      spread_target: "",
      keywords: "",
      signal_id: "crack-321", signal_direction: "either", signal_threshold: "1.5", seasonality_return: "1", seasonality_hit_rate: "60", seasonality_id: "wti",
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUseType(alertType)) {
      setPaywallOpen(true);
      return;
    }
    if (!["news_keyword", "spread_signal", "carry_signal", "seasonality_signal"].includes(alertType) && !form.commodity_name) {
      toast({ title: "Pick a commodity", variant: "destructive" });
      return;
    }

    let payload: Parameters<typeof createAlert.mutateAsync>[0];
    const symbol =
      commodities.find((c: any) => c.name === form.commodity_name)?.symbol ?? null;
    const base = {
      commodity_name: form.commodity_name || "(news)",
      commodity_symbol: symbol,
      cooldown_minutes: form.cooldown_minutes,
      note: form.note || null,
    };

    if (alertType === "price") {
      const price = parseFloat(form.target_price);
      if (!Number.isFinite(price) || price <= 0) {
        toast({ title: "Enter a positive target price", variant: "destructive" });
        return;
      }
      payload = { ...base, alert_type: "price", condition: form.condition, target_price: price };
    } else if (alertType === "pct_move") {
      const thr = parseFloat(form.pct_threshold);
      if (!Number.isFinite(thr) || thr <= 0) {
        toast({ title: "Enter a positive % threshold", variant: "destructive" });
        return;
      }
      payload = {
        ...base,
        alert_type: "pct_move",
        config: { window: form.pct_window, threshold_pct: thr },
      };
    } else if (alertType === "volatility_band") {
      const days = parseInt(form.vol_window_days, 10);
      const sd = parseFloat(form.vol_std_devs);
      if (!days || days < 5 || !Number.isFinite(sd) || sd <= 0) {
        toast({ title: "Window ≥ 5 days and σ > 0", variant: "destructive" });
        return;
      }
      payload = {
        ...base,
        alert_type: "volatility_band",
        config: { window_days: days, std_devs: sd },
      };
    } else if (alertType === "spread") {
      const tgt = parseFloat(form.spread_target);
      if (!Number.isFinite(tgt)) {
        toast({ title: "Enter a spread target", variant: "destructive" });
        return;
      }
      payload = {
        ...base,
        alert_type: "spread",
        config: { spread_name: form.spread_name, condition: form.condition, target: tgt },
      };
    } else if (alertType === "spread_signal") {
      const threshold = parseFloat(form.signal_threshold);
      if (!Number.isFinite(threshold) || threshold <= 0) { toast({ title: "Enter a positive z-score", variant: "destructive" }); return; }
      payload = { ...base, commodity_name: "Spread signal", alert_type: "spread_signal", config: { spread_id: form.signal_id, z_threshold: threshold, direction: form.signal_direction } };
    } else if (alertType === "carry_signal") {
      const threshold = parseFloat(form.signal_threshold);
      if (!Number.isFinite(threshold) || threshold <= 0) { toast({ title: "Enter a positive annualized threshold", variant: "destructive" }); return; }
      payload = { ...base, commodity_name: "Carry signal", alert_type: "carry_signal", config: { product_id: form.signal_id, annualized_threshold: threshold, direction: form.signal_direction } };
    } else if (alertType === "seasonality_signal") {
      const minReturn = parseFloat(form.seasonality_return), minHitRate = parseFloat(form.seasonality_hit_rate) / 100;
      if (!Number.isFinite(minReturn) || !Number.isFinite(minHitRate) || minHitRate < 0 || minHitRate > 1) { toast({ title: "Enter valid seasonal thresholds", variant: "destructive" }); return; }
      payload = { ...base, commodity_name: form.seasonality_id, alert_type: "seasonality_signal", config: { commodity: form.seasonality_id, min_avg_return: minReturn, min_hit_rate: minHitRate } };
    } else {
      const kws = form.keywords.split(",").map((k) => k.trim()).filter(Boolean);
      if (kws.length === 0) {
        toast({ title: "Add at least one keyword", variant: "destructive" });
        return;
      }
      payload = {
        ...base,
        alert_type: "news_keyword",
        config: { keywords: kws },
      };
    }

    try {
      await createAlert.mutateAsync(payload);
      toast({ title: "Alert created", description: "We'll notify you when conditions are met." });
      setOpen(false);
      resetForm();
      setAlertType("price");
    } catch (err: any) {
      const msg = String(err?.message ?? "Failed to create alert");
      if (msg.includes("limit reached") || msg.includes("require")) {
        setPaywallOpen(true);
      } else {
        toast({ title: "Failed to create alert", description: msg, variant: "destructive" });
      }
    }
  };

  const renderSummary = (a: any) => {
    if (a.alert_type === "price" || !a.alert_type)
      return `${a.condition} $${a.target_price}`;
    if (a.alert_type === "pct_move")
      return `${a.config?.threshold_pct}% in ${a.config?.window}`;
    if (a.alert_type === "volatility_band")
      return `±${a.config?.std_devs}σ band (${a.config?.window_days}d)`;
    if (a.alert_type === "spread")
      return `${a.config?.spread_name} ${a.config?.condition} ${a.config?.target}`;
    if (a.alert_type === "spread_signal") return `${a.config?.spread_id} |z| ≥ ${a.config?.z_threshold}`;
    if (a.alert_type === "carry_signal") return `${a.config?.product_id} ${a.config?.direction} ${a.config?.annualized_threshold}%`;
    if (a.alert_type === "seasonality_signal") return `${a.config?.commodity}: ≥${a.config?.min_avg_return}% / ≥${Math.round((a.config?.min_hit_rate ?? 0) * 100)}% hit`;
    if (a.alert_type === "news_keyword")
      return `news: ${(a.config?.keywords ?? []).join(", ")}`;
    return "";
  };

  const limits = limitsFor(tier);

  const handleExportCsv = () => {
    if (!limits.csvExport) { setPaywallOpen(true); return; }
    downloadCsv(
      'price-alerts.csv',
      ['Commodity', 'Type', 'Summary', 'Active', 'Cooldown (min)', 'Note', 'Last Triggered', 'Created'],
      alerts.map((a: any) => [
        a.commodity_name,
        a.alert_type ?? 'price',
        renderSummary(a),
        a.is_active ? 'yes' : 'no',
        a.cooldown_minutes ?? '',
        a.note ?? '',
        a.last_triggered_at ?? '',
        a.created_at ?? '',
      ]),
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Dashboard
        </Button>

        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="w-6 h-6 text-primary" />
              Smart Alerts
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Price thresholds, historical spread extremes, carry, seasonality, volatility, and news signals.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {activeCount}/{limit} active alerts {isPremium ? "(Premium)" : "(Free tier)"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportCsv}
              disabled={alerts.length === 0}
              title={limits.csvExport ? 'Export CSV' : 'Upgrade to export CSV'}
            >
              {limits.csvExport ? <Download className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
              CSV
            </Button>
            <Button onClick={handleCreateClick}>
              <Plus className="w-4 h-4 mr-2" />
              New alert
            </Button>
          </div>
        </div>

        {!isPremium && (
          <Card className="mb-6 border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">Free tier: 1 price alert</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Upgrade for % move alerts (Premium) and volatility / spread / news alerts (Pro).
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setPaywallOpen(true)}>
                Upgrade
              </Button>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : alerts.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No alerts yet</CardTitle>
              <CardDescription>
                Set your first alert to get notified on price, % move, volatility, spread, or news events.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-3">
            {alerts.map((a) => (
              <Card key={a.id}>
                <CardContent className="pt-6 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{a.commodity_name}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {ALERT_TYPE_META[(a.alert_type ?? "price") as AlertType]?.label ?? a.alert_type}
                      </Badge>
                      <Badge variant={a.condition === "below" ? "secondary" : "default"}>
                        {renderSummary(a)}
                      </Badge>
                      {!a.is_active && <Badge variant="outline">Paused</Badge>}
                    </div>
                    {a.note && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{a.note}</p>
                    )}
                    {a.last_triggered_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last triggered {new Date(a.last_triggered_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={a.is_active}
                      onCheckedChange={(v) =>
                        toggleAlert.mutate(
                          { id: a.id, is_active: v },
                          {
                            onError: (err: any) => {
                              const msg = String(err?.message ?? "");
                              if (msg.includes("limit reached")) setPaywallOpen(true);
                              else toast({ title: "Update failed", description: msg, variant: "destructive" });
                            },
                          },
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteAlert.mutate(a.id)}
                      aria-label="Delete alert"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New smart alert</DialogTitle>
            <DialogDescription>
              We'll check every 5 minutes and notify you when your conditions are met.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Alert type</Label>
              <Select value={alertType} onValueChange={(v) => setAlertType(v as AlertType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ALERT_TYPE_META) as AlertType[]).map((t) => {
                    const locked = !canUseType(t);
                    return (
                      <SelectItem key={t} value={t}>
                        <span className="flex items-center gap-2">
                          {locked && <Lock className="w-3 h-3" />}
                          {ALERT_TYPE_META[t].label}
                          {locked && (
                            <span className="text-[10px] text-muted-foreground uppercase">
                              {ALERT_TYPE_META[t].minTier}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ALERT_TYPE_META[alertType].desc}</p>
              {!canUseType(alertType) && (
                <p className="text-xs text-amber-500 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Requires {ALERT_TYPE_META[alertType].minTier} tier.
                </p>
              )}
            </div>

            {!["news_keyword", "spread_signal", "carry_signal", "seasonality_signal"].includes(alertType) && (
              <div className="space-y-2">
                <Label>Commodity</Label>
                <Select
                  value={form.commodity_name}
                  onValueChange={(v) => setForm((f) => ({ ...f, commodity_name: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a commodity" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {commodities.map((c: any) => (
                      <SelectItem key={c.name} value={c.name}>
                        {c.name}
                        {typeof c.price === "number" ? ` (now $${c.price.toFixed(2)})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {alertType === "price" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Select
                    value={form.condition}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, condition: v as "above" | "below" }))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="above">Goes above</SelectItem>
                      <SelectItem value="below">Goes below</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Target price (USD)</Label>
                  <Input
                    type="number" step="0.01" min="0.01"
                    value={form.target_price}
                    onChange={(e) => setForm((f) => ({ ...f, target_price: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {alertType === "pct_move" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Window</Label>
                  <Select
                    value={form.pct_window}
                    onValueChange={(v) => setForm((f) => ({ ...f, pct_window: v as any }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">1 hour</SelectItem>
                      <SelectItem value="24h">24 hours</SelectItem>
                      <SelectItem value="7d">7 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Threshold (% absolute)</Label>
                  <Input
                    type="number" step="0.1" min="0.1"
                    value={form.pct_threshold}
                    onChange={(e) => setForm((f) => ({ ...f, pct_threshold: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {alertType === "volatility_band" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Window (days)</Label>
                  <Input
                    type="number" min="5" max="120"
                    value={form.vol_window_days}
                    onChange={(e) => setForm((f) => ({ ...f, vol_window_days: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Std deviations (σ)</Label>
                  <Input
                    type="number" step="0.1" min="0.5" max="5"
                    value={form.vol_std_devs}
                    onChange={(e) => setForm((f) => ({ ...f, vol_std_devs: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {alertType === "spread" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Spread</Label>
                  <Select
                    value={form.spread_name}
                    onValueChange={(v) => setForm((f) => ({ ...f, spread_name: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="brent_wti">Brent − WTI</SelectItem>
                      <SelectItem value="gold_silver">Gold / Silver ratio</SelectItem>
                      <SelectItem value="crack_321">3-2-1 Crack spread</SelectItem>
                      <SelectItem value="soy_crush">Soybean crush</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Condition</Label>
                    <Select
                      value={form.condition}
                      onValueChange={(v) => setForm((f) => ({ ...f, condition: v as any }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="above">Above</SelectItem>
                        <SelectItem value="below">Below</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Target value</Label>
                    <Input
                      type="number" step="0.01"
                      value={form.spread_target}
                      onChange={(e) => setForm((f) => ({ ...f, spread_target: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {(alertType === "spread_signal" || alertType === "carry_signal") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>{alertType === "spread_signal" ? "Spread" : "Commodity"}</Label><Select value={form.signal_id} onValueChange={(v) => setForm((f) => ({ ...f, signal_id: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{alertType === "spread_signal" ? <><SelectItem value="crack-321">3-2-1 Crack</SelectItem><SelectItem value="soy-crush">Soy Crush</SelectItem><SelectItem value="wti-brent">WTI − Brent</SelectItem><SelectItem value="gold-silver">Gold / Silver</SelectItem></> : <><SelectItem value="wti">WTI Crude</SelectItem><SelectItem value="brent">Brent</SelectItem><SelectItem value="gold">Gold</SelectItem><SelectItem value="corn">Corn</SelectItem></>}</SelectContent></Select></div>
                <div className="space-y-2"><Label>{alertType === "spread_signal" ? "Z-score threshold" : "Annualized carry %"}</Label><Input type="number" step="0.1" value={form.signal_threshold} onChange={(e) => setForm((f) => ({ ...f, signal_threshold: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Direction</Label><Select value={form.signal_direction} onValueChange={(v) => setForm((f) => ({ ...f, signal_direction: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{alertType === "spread_signal" ? <><SelectItem value="either">Either extreme</SelectItem><SelectItem value="rich">Rich</SelectItem><SelectItem value="cheap">Cheap</SelectItem></> : <><SelectItem value="either">Either structure</SelectItem><SelectItem value="contango">Contango</SelectItem><SelectItem value="backwardation">Backwardation</SelectItem></>}</SelectContent></Select></div>
              </div>
            )}

            {alertType === "seasonality_signal" && (
              <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Commodity</Label><Select value={form.seasonality_id} onValueChange={(v) => setForm((f) => ({ ...f, seasonality_id: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="wti">WTI Crude</SelectItem><SelectItem value="brent">Brent</SelectItem><SelectItem value="natgas">Natural Gas</SelectItem><SelectItem value="gold">Gold</SelectItem><SelectItem value="corn">Corn</SelectItem><SelectItem value="wheat">Wheat</SelectItem><SelectItem value="soybeans">Soybeans</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Minimum avg monthly return %</Label><Input type="number" step="0.1" value={form.seasonality_return} onChange={(e) => setForm((f) => ({ ...f, seasonality_return: e.target.value }))} /></div><div className="space-y-2"><Label>Minimum hit rate %</Label><Input type="number" min="0" max="100" value={form.seasonality_hit_rate} onChange={(e) => setForm((f) => ({ ...f, seasonality_hit_rate: e.target.value }))} /></div></div>
            )}

            {alertType === "news_keyword" && (
              <div className="space-y-2">
                <Label>Keywords (comma-separated)</Label>
                <Input
                  value={form.keywords}
                  onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
                  placeholder="OPEC, sanctions, hurricane"
                />
                <p className="text-xs text-muted-foreground">
                  Any match in incoming news will fire the alert.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Re-fire cooldown (minutes)</Label>
              <Input
                type="number"
                min="5"
                step="5"
                value={form.cooldown_minutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cooldown_minutes: Math.max(5, Number(e.target.value) || 60) }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Avoids notification spam if the price hovers around the threshold.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input
                maxLength={200}
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="e.g. Stop-loss level"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              {canUseType(alertType) ? (
                <Button type="submit" disabled={createAlert.isPending}>
                  {createAlert.isPending ? "Creating…" : "Create alert"}
                </Button>
              ) : (
                <Button type="button" onClick={() => { setOpen(false); setPaywallOpen(true); }}>
                  Upgrade to {ALERT_TYPE_META[alertType].minTier}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

export default PriceAlertsPage;
