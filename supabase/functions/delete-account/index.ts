import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);

  const userId = userData.user.id;
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const logger = new EdgeLogger({ functionName: 'delete-account' });

  try {
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('subscription_active')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.subscription_active) {
      return json({ error: 'cancel_subscription_first' }, 409);
    }

    // Delete non-cascading user records before deleting auth.users. Tables with
    // foreign keys to auth.users/profile rows are removed by the final delete.
    const tables = [
      'ai_messages', 'ai_threads', 'price_alert_triggers', 'price_alerts',
      'watchlist_items', 'watchlists', 'portfolio_positions', 'portfolios',
      'trade_executions', 'trading_orders', 'portfolio_snapshots', 'risk_metrics',
      'trading_sessions', 'audit_logs', 'synthetic_trade_history', 'synthetic_positions',
      'usdc_balances', 'wallet_connections', 'kyc_verifications', 'user_legal_acceptance',
      'price_comparisons', 'recent_activities', 'sentiment_votes', 'user_favorites',
      'device_tokens', 'ai_usage_windows', 'user_spreads', 'pro_daily_briefs',
      'forum_posts', 'forum_topics', 'ibkr_credentials', 'blofin_credentials',
      'billing_webhook_events',
    ];

    for (const table of tables) {
      const { error } = await admin.from(table).delete().eq('user_id', userId);
      if (error) throw new Error(`Could not delete ${table}: ${error.message}`);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    logger.info('Account deleted', { userId });
    return json({ ok: true });
  } catch (error) {
    logger.error('Account deletion failed', error, { userId });
    return json({ error: 'deletion_failed' }, 500);
  }
});
