// Shared Pro-tier check for edge functions that gate a route behind the Pro
// subscription. Extracted from pro-analytics so run-strategy-backtest (and any
// future Pro-only function) doesn't duplicate/drift from this check.
import type { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export async function ensurePro(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('get_user_tier', { _user_id: userId });
  if (error) return false;
  return data === 'pro';
}
