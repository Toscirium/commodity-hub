import React from 'react';
import { Bell, Check, Eye, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface PriceAlertProposal {
  kind: 'price_alert';
  commodity_name: string;
  commodity_symbol?: string;
  condition: 'above' | 'below';
  target_price: number;
  note?: string;
}

export interface WatchlistAddProposal {
  kind: 'watchlist_add';
  commodity_name: string;
  commodity_symbol?: string;
}

export type Proposal = PriceAlertProposal | WatchlistAddProposal;

/** Narrows an arbitrary tool-part payload to a Proposal, or null. */
export function readProposal(output: unknown): Proposal | null {
  const candidate = (output as { proposal?: unknown } | null | undefined)?.proposal as
    | Partial<Proposal>
    | undefined;
  if (!candidate || typeof candidate !== 'object') return null;
  if (candidate.kind === 'price_alert') {
    const p = candidate as Partial<PriceAlertProposal>;
    if (
      typeof p.commodity_name === 'string' &&
      (p.condition === 'above' || p.condition === 'below') &&
      typeof p.target_price === 'number' &&
      Number.isFinite(p.target_price) &&
      p.target_price > 0
    ) {
      return p as PriceAlertProposal;
    }
    return null;
  }
  if (candidate.kind === 'watchlist_add') {
    const p = candidate as Partial<WatchlistAddProposal>;
    return typeof p.commodity_name === 'string' ? (p as WatchlistAddProposal) : null;
  }
  return null;
}

/**
 * Confirmation card for an action Copilot has proposed.
 *
 * The model never writes anything itself — its tool only returns a validated
 * proposal (see propose_* in supabase/functions/ai-copilot). The insert
 * happens here, on an explicit tap, using the signed-in user's own session so
 * it goes through RLS rather than the edge function's service-role client.
 */
const ProposalCard: React.FC<{ proposal: Proposal }> = ({ proposal }) => {
  const { user } = useAuth();
  const [state, setState] = React.useState<'idle' | 'saving' | 'done' | 'dismissed'>('idle');

  if (state === 'dismissed') return null;

  const confirm = async () => {
    if (!user) return;
    setState('saving');
    try {
      if (proposal.kind === 'price_alert') {
        const { error } = await supabase.from('price_alerts').insert({
          user_id: user.id,
          commodity_name: proposal.commodity_name,
          commodity_symbol: proposal.commodity_symbol ?? null,
          condition: proposal.condition,
          target_price: proposal.target_price,
          note: proposal.note ?? null,
        });
        if (error) throw error;
        toast.success('Price alert created');
      } else {
        // Land it in the user's default watchlist, falling back to whichever
        // one exists; only create a list when they genuinely have none.
        const { data: lists } = await supabase
          .from('watchlists')
          .select('id, is_default')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false })
          .limit(1);
        let watchlistId = lists?.[0]?.id;
        if (!watchlistId) {
          const { data: created, error: createErr } = await supabase
            .from('watchlists')
            .insert({ user_id: user.id, name: 'My Watchlist', is_default: true })
            .select('id')
            .single();
          if (createErr) throw createErr;
          watchlistId = created.id;
        }
        const { error } = await supabase.from('watchlist_items').insert({
          watchlist_id: watchlistId,
          user_id: user.id,
          commodity_name: proposal.commodity_name,
          commodity_symbol: proposal.commodity_symbol ?? null,
        });
        // UNIQUE (watchlist_id, commodity_name) — already watching it is a
        // success from the user's point of view, not an error to shout about.
        if (error && error.code !== '23505') throw error;
        toast.success(
          error?.code === '23505'
            ? `${proposal.commodity_name} is already on your watchlist`
            : 'Added to watchlist'
        );
      }
      setState('done');
    } catch (err) {
      setState('idle');
      toast.error("Couldn't save that", {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    }
  };

  const isAlert = proposal.kind === 'price_alert';
  const Icon = isAlert ? Bell : Eye;

  return (
    <div className="my-2 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {isAlert
              ? `Alert when ${proposal.commodity_name} goes ${proposal.condition} $${proposal.target_price.toLocaleString()}`
              : `Add ${proposal.commodity_name} to your watchlist`}
          </p>
          {isAlert && proposal.note && (
            <p className="mt-0.5 text-xs text-muted-foreground">{proposal.note}</p>
          )}

          {state === 'done' ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              {isAlert ? 'Alert created' : 'Added'}
            </p>
          ) : (
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => void confirm()} disabled={state === 'saving' || !user}>
                {state === 'saving' ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Confirm'
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setState('dismissed')}
                disabled={state === 'saving'}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Dismiss
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProposalCard;
