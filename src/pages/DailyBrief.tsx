import React, { useEffect } from 'react';
import PageShell from '@/components/PageShell';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Sparkles, Lock, TrendingUp, TrendingDown, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import PremiumPaywall from '@/components/PremiumPaywall';

interface SpreadItem {
  label: string;
  current?: number;
  unit?: string;
  zScore?: number;
  tag?: string;
}
interface SeasonalItem {
  commodity: string;
  label: string;
  avgReturn: number;
  hitRate: number;
  years: number;
}
interface Section {
  id: string;
  title: string;
  items: (SpreadItem | SeasonalItem)[];
}
interface Brief {
  id: string;
  brief_date: string;
  headline: string;
  sections: Section[];
  read_at: string | null;
  created_at: string;
}

const DailyBrief: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const [paywallOpen, setPaywallOpen] = React.useState(false);
  const qc = useQueryClient();

  const { data: briefs, isLoading } = useQuery({
    queryKey: ['pro-daily-briefs'],
    enabled: isPro,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pro_daily_briefs')
        .select('*')
        .order('brief_date', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as Brief[];
    },
  });

  const latest = briefs?.[0];

  // Auto-mark latest as read on view
  useEffect(() => {
    if (!latest || latest.read_at) return;
    supabase
      .from('pro_daily_briefs')
      .update({ read_at: new Date().toISOString() })
      .eq('id', latest.id)
      .then(() => qc.invalidateQueries({ queryKey: ['pro-daily-briefs'] }));
  }, [latest?.id, latest?.read_at, qc]);

  return (
    <PageShell
      eyebrow="BRIEF"
      title="Pro Daily Brief"
      description="Every morning at 06:00 UTC: the most stretched spreads, seasonal biases, and market dislocations — auto-generated from your Pro analytics."
      badges={<><Badge className="ml-1 bg-primary/15 text-primary border-transparent">Pro</Badge></>}
    >

        {!isPro ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <Lock className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Daily Brief is a Pro feature</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Start your day with the market's biggest dislocations already surfaced. No more scrolling — the tape comes to you.
                </p>
              </div>
              <Button onClick={() => setPaywallOpen(true)}>Upgrade to Pro</Button>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your briefs…</p>
        ) : !briefs?.length ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                No briefs yet. Your first Pro Daily Brief will land tomorrow at 06:00 UTC.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {briefs.map((b, i) => (
              <Card key={b.id} className={i === 0 ? 'border-primary/40' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardDescription className="flex items-center gap-2 text-sm">
                      <CalendarDays className="w-4 h-4" />
                      {new Date(b.brief_date).toLocaleDateString(undefined, {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}
                      {i === 0 && <Badge variant="outline" className="text-[10px]">Latest</Badge>}
                    </CardDescription>
                  </div>
                  <h2 className="text-base font-semibold mt-1">{b.headline}</h2>
                </CardHeader>
                <CardContent className="pt-2 space-y-4">
                  {b.sections.map((s) => (
                    <div key={s.id}>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{s.title}</p>
                      {s.items.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nothing notable today.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {s.items.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm">
                              {'zScore' in item ? (
                                <>
                                  {(item.zScore ?? 0) > 0 ? (
                                    <TrendingUp className="w-4 h-4 text-red-400 mt-0.5" />
                                  ) : (
                                    <TrendingDown className="w-4 h-4 text-emerald-400 mt-0.5" />
                                  )}
                                  <span className="flex-1">
                                    <span className="font-medium">{item.label}</span> at {item.current?.toFixed(2)} {item.unit ?? ''} · z {item.zScore?.toFixed(2)}
                                    <span className={`ml-2 text-[10px] uppercase font-semibold ${item.tag === 'rich' ? 'text-red-400' : 'text-emerald-400'}`}>{item.tag}</span>
                                  </span>
                                </>
                              ) : (
                                <>
                                  {(item as SeasonalItem).avgReturn > 0 ? (
                                    <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5" />
                                  ) : (
                                    <TrendingDown className="w-4 h-4 text-red-400 mt-0.5" />
                                  )}
                                  <span className="flex-1">
                                    <span className="font-medium">{item.label}</span> avg {(item as SeasonalItem).avgReturn > 0 ? '+' : ''}{(item as SeasonalItem).avgReturn.toFixed(2)}% · hit {Math.round((item as SeasonalItem).hitRate * 100)}% over {(item as SeasonalItem).years}y
                                  </span>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </PageShell>
  );
};

export default DailyBrief;