import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { UIMessage } from 'ai';

export type AiThread = {
  id: string;
  title: string;
  updated_at: string;
};

export function useAiThreads(userId: string | undefined) {
  const [threads, setThreads] = useState<AiThread[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('ai_threads')
      .select('id,title,updated_at')
      .order('updated_at', { ascending: false });
    setThreads(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createThread = useCallback(async (): Promise<string | null> => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('ai_threads')
      .insert({ user_id: userId, title: 'New conversation' })
      .select('id')
      .single();
    if (error || !data) return null;
    await refresh();
    return data.id;
  }, [userId, refresh]);

  const deleteThread = useCallback(async (id: string) => {
    await supabase.from('ai_threads').delete().eq('id', id);
    await refresh();
  }, [refresh]);

  return { threads, loading, refresh, createThread, deleteThread };
}

export async function loadThreadMessages(threadId: string): Promise<UIMessage[]> {
  const { data } = await supabase
    .from('ai_messages')
    .select('id,role,parts,created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  return (data ?? []).map((r: any) => ({
    id: r.id,
    role: r.role,
    parts: r.parts ?? [],
  })) as UIMessage[];
}