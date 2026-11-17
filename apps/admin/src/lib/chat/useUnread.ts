'use client';
import type { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { subscribeAuthed } from '@/lib/supabase/realtime';
import { UNREAD_CHANGED, type UnreadRow } from './unread';

let seq = 0;

/** 안 읽은 문의 수. 새 메시지가 오거나 누가 읽음 처리하면 다시 센다 */
export function useUnread(): UnreadRow[] {
  const [rows, setRows] = useState<UnreadRow[]>([]);
  useEffect(() => {
    const supabase = browserClient();
    let alive = true;
    const refetch = async () => {
      const { data } = await supabase.rpc('unread_counts');
      if (alive && data) setRows(data as UnreadRow[]);
    };
    const stop = subscribeAuthed(supabase, () => supabase.channel(`unread-${++seq}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => void refetch())
      .subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => { if (status === 'SUBSCRIBED') void refetch(); }));
    const onChanged = () => void refetch();
    window.addEventListener(UNREAD_CHANGED, onChanged);
    void refetch();
    return () => {
      alive = false;
      window.removeEventListener(UNREAD_CHANGED, onChanged);
      stop();
    };
  }, []);
  return rows;
}
