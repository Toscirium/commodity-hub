import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { ParsedImportRow } from '@/lib/statementImport';

/**
 * Bulk-inserts rows parsed from an uploaded broker statement (see
 * src/components/ImportPositionsDialog.tsx). Dedupes against
 * already-imported rows for the same user+broker by external_id so
 * re-uploading the same statement doesn't create duplicates.
 */
export const useImportPositions = (portfolioId?: string) => {
  const auth = useAuth();
  const { toast } = useToast();
  const [importing, setImporting] = React.useState(false);

  const importPositions = async (rows: ParsedImportRow[], broker: string) => {
    if (!auth?.user) throw new Error('User not authenticated');
    const userId = auth.user.id;
    setImporting(true);

    try {
      const { data: existing, error: existingErr } = await supabase
        .from('portfolio_positions')
        .select('external_id')
        .eq('user_id', userId)
        .eq('broker', broker)
        .not('external_id', 'is', null);
      if (existingErr) throw existingErr;

      const existingIds = new Set((existing ?? []).map((r) => r.external_id));
      const toInsert = rows.filter((r) => !existingIds.has(r.external_id));
      const skipped = rows.length - toInsert.length;

      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase.from('portfolio_positions').insert(
          toInsert.map((r) => ({
            user_id: userId,
            portfolio_id: portfolioId,
            commodity_name: r.commodity_name as string,
            quantity: r.quantity as number,
            entry_price: r.entry_price as number,
            entry_date: r.entry_date as string,
            side: r.side,
            leverage: r.leverage,
            status: r.status,
            exit_price: r.exit_price,
            closed_date: r.closed_date,
            broker,
            source: 'statement_import',
            external_id: r.external_id,
            notes: r.notes,
          })),
        );
        if (insertErr) throw insertErr;
      }

      toast({
        title: 'Import complete',
        description: `${toInsert.length} position${toInsert.length === 1 ? '' : 's'} imported` +
          (skipped > 0 ? `, ${skipped} skipped as already imported.` : '.'),
      });

      return { imported: toInsert.length, skipped };
    } catch (error) {
      console.error('Error importing positions:', error);
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Failed to import positions',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setImporting(false);
    }
  };

  return { importPositions, importing };
};
