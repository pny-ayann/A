import { subscribeAuthed, uniqueTopic, type WalletSummary } from '@takson/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../supabase';

export type Entry = {
  id: string; amount: number; kind: string; label: string;
  effective_at: string; withdrawable_at: string | null; ref_id: string | null; created_at: string;
};
export type Request = { id: string; amount: number; status: 'requested' | 'paid' | 'rejected'; reason: string | null; created_at: string };
export type Account = { bank: string; number: string; holder: string };

/** 내 충전금: 잔액 세 가지, 장부(최근 100줄), 출금 신청, 받을 계좌. 화면에 올 때와 장부에 줄이 생길 때 다시 읽는다 */
export function useWallet() {
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [account, setAccount] = useState<Account | null>(null);

  const reload = useCallback(async () => {
    if (!me) return;
    const [s, e, r, a] = await Promise.all([
      supabase.rpc('wallet_summary', { p_driver: me }),
      supabase.from('wallet_entries').select('id, amount, kind, label, effective_at, withdrawable_at, ref_id, created_at')
        .eq('driver_id', me).order('created_at', { ascending: false }).limit(100),
      supabase.from('withdrawal_requests').select('id, amount, status, reason, created_at')
        .eq('driver_id', me).order('created_at', { ascending: false }).limit(50),
      supabase.from('bank_accounts').select('bank, number, holder').eq('driver_id', me).maybeSingle(),
    ]);
    if (!s.error) setSummary(((s.data ?? []) as WalletSummary[])[0] ?? { balance: 0, withdrawable: 0, pending: 0 });
    if (!e.error) setEntries((e.data ?? []) as Entry[]);
    if (!r.error) setRequests((r.data ?? []) as Request[]);
    if (!a.error) setAccount((a.data as Account | null) ?? null);
  }, [me]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  useEffect(() => {
    if (!me) return;
    return subscribeAuthed(supabase, () => supabase.channel(uniqueTopic(`wallet-${me}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wallet_entries', filter: `driver_id=eq.${me}` }, () => void reload())
      .subscribe());
  }, [me, reload]);

  return { summary, entries, requests, account, reload };
}
