import React from 'react';
import { Sparkles, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { monitoringService } from '@/services/monitoringService';

interface EliteWaitlistCardProps {
  /** Which page this rendered on — see elite_waitlist.source. */
  source: string;
  className?: string;
}

/**
 * Demand-validation card for a hypothetical "Elite" tier (real-time CME
 * data via Databento) — NOT wired to any actual entitlement or purchase
 * flow. Real-time redistribution to our own paying subscribers needs
 * Databento's Plus plan: $1,750/mo on a signed annual contract (confirmed
 * directly against their feature-comparison table — the $199/mo Standard
 * plan is personal/non-commercial use only). That's a real ~$21k/yr
 * commitment with zero revenue behind it yet, so this exists to gauge
 * actual interest before anyone signs anything, not to sell something that
 * doesn't exist. See elite_waitlist migration for the full reasoning.
 */
const EliteWaitlistCard: React.FC<EliteWaitlistCardProps> = ({ source, className }) => {
  const auth = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userId = auth?.user?.id;

  const { data: joined, isLoading } = useQuery({
    queryKey: ['elite-waitlist', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('elite_waitlist')
        .select('user_id')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    enabled: Boolean(userId),
    staleTime: Infinity, // membership only ever goes false -> true, never back
  });

  const join = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('elite_waitlist').insert({ user_id: userId!, source });
      // A second click racing the query cache is a harmless duplicate insert
      // attempt against the PK, not a real failure — same 23505 pattern the
      // billing webhook uses for idempotency.
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: () => {
      queryClient.setQueryData(['elite-waitlist', userId], true);
      monitoringService.trackUserEvent('elite_waitlist_joined', { source });
      toast({ title: "You're on the list", description: "We'll email you if Elite becomes real." });
    },
    onError: (error) => {
      toast({ title: 'Could not join the waitlist', description: (error as Error).message, variant: 'destructive' });
    },
  });

  if (!userId) return null;

  return (
    <Card className={`border-primary/30 bg-primary/5 ${className ?? ''}`}>
      <CardContent className="py-4 flex items-center gap-3 flex-wrap">
        <Sparkles className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-medium">Want real-time data, not delayed?</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            We're gauging interest in an Elite tier with live CME pricing. No commitment — just tell us you'd want it.
          </p>
        </div>
        {joined ? (
          <Button size="sm" variant="outline" disabled className="shrink-0 gap-1.5">
            <Check className="w-3.5 h-3.5" /> On the list
          </Button>
        ) : (
          <Button size="sm" onClick={() => join.mutate()} disabled={isLoading || join.isPending} className="shrink-0">
            Join the waitlist
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default EliteWaitlistCard;
