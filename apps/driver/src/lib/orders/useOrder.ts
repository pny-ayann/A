import { subscribeAuthed, uniqueTopic, type DocStatus, type OrderKind, type OrderStatus } from '@takson/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useFocusedInterval } from '../useInterval';
import type { DocState, Missing } from './progress';

export type Stop = {
  address: string; detail: string | null; area: string | null; lat: number | null; lng: number | null;
  contact_name: string | null; contact_phone: string | null;
};
export type MyOrder = {
  id: string; order_no: string; kind: OrderKind; status: OrderStatus; reserved_at: string | null; assigned_at: string | null;
  capital_company_id: string | null; seal_count: number | null;
  driver_id: string | null; fare: number; payment_method: 'cash' | 'postpaid';
  vehicle_number: string | null; vehicle_model: string | null; vehicle_color: string | null; transmission: 'auto' | 'manual' | null;
  driver_memo: string | null;
  pickup: Stop; dropoff: Stop; waypoints: Stop[]; missions: string[];
};

function stop(r: Record<string, unknown>, p: 'pickup' | 'dropoff'): Stop {
  return {
    address: r[`${p}_address`] as string, detail: r[`${p}_detail`] as string | null, area: r[`${p}_area`] as string | null,
    lat: r[`${p}_lat`] as number | null, lng: r[`${p}_lng`] as number | null,
    contact_name: r[`${p}_contact_name`] as string | null, contact_phone: r[`${p}_contact_phone`] as string | null,
  };
}

const NONE = { data: [] as string[] };

/** 캐피탈 예시 한 장 (표지는 사진 칸 없이 보기만) */
export type Example = { id: string; seq: number; title: string; path: string; is_cover: boolean };
/** 서류탁송 서류: 서버 상태 + 칸별 올린 서류 + 회사 예시 */
export type DocInfo = {
  state: NonNullable<DocState>;
  rows: { slot: string; status: DocStatus; reason: string | null }[];
  examples: Example[];
  capitalName: string | null;
};

/**
 * 내 오더 하나. 관제의 요금 수정·상태 변경은 실시간으로 받고,
 * 회수·취소처럼 나에게서 오더가 사라지는 변경은 실시간이 오지 않으므로(RLS) 15초마다도 확인한다.
 * gone = 더 이상 내 오더가 아님(회수·취소 또는 없음)
 */
export function useOrder(id: string, myId: string | undefined) {
  const [order, setOrder] = useState<MyOrder | null>(null);
  const [missing, setMissing] = useState<Missing>({ pickup: [], dropoff: [] });
  const [gone, setGone] = useState(false);
  const [settings, setSettings] = useState({ release_min_takson: 10, release_min_daeri: 5 });
  const [docs, setDocs] = useState<DocInfo | null>(null);

  const load = useCallback(async () => {
    const { data: r, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
    if (error) return; // 신호 문제 등: 화면은 그대로 두고 다음에 다시
    if (!r || r.driver_id !== myId || r.status === 'cancelled') { setGone(true); setOrder(null); return; }
    const [wps, ms, mp, md] = await Promise.all([
      supabase.from('order_waypoints').select('*').eq('order_id', id).order('seq'),
      supabase.from('order_missions').select('missions(name)').eq('order_id', id),
      r.status === 'assigned' || r.status === 'arrived_pickup' ? supabase.rpc('missing_photos', { p_order_id: id, p_phase: 'pickup' }) : NONE,
      r.status === 'driving' ? supabase.rpc('missing_photos', { p_order_id: id, p_phase: 'dropoff' }) : NONE,
    ]);
    setMissing({ pickup: (mp.data ?? []) as string[], dropoff: (md.data ?? []) as string[] });
    setDocs(r.kind === 'docs' ? await loadDocs(id, r.capital_company_id as string | null) : null);
    setOrder({
      ...(r as unknown as MyOrder),
      pickup: stop(r, 'pickup'),
      dropoff: stop(r, 'dropoff'),
      waypoints: (wps.data ?? []) as unknown as Stop[],
      missions: (ms.data ?? []).map(m => (m as unknown as { missions: { name: string } | null }).missions?.name ?? '').filter(Boolean),
    });
    setGone(false);
  }, [id, myId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useFocusedInterval(() => void load(), 15_000);

  useEffect(() => {
    void supabase.from('settings').select('release_min_takson, release_min_daeri').maybeSingle()
      .then(({ data }) => { if (data) setSettings(data); });
    return subscribeAuthed(supabase, () => supabase.channel(uniqueTopic(`order-${id}`))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, () => void load())
      // 관제가 서류를 인정·불인정하면 바로 보이게
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_documents', filter: `order_id=eq.${id}` }, () => void load())
      .subscribe());
  }, [id, load]);

  return { order, missing, gone, settings, docs, reload: load };
}

export type ActiveRow = {
  id: string; kind: OrderKind; status: OrderStatus; reserved_at: string | null;
  pickup_area: string | null; dropoff_area: string | null; fare: number; payment_method: 'cash' | 'postpaid';
};

/** 내가 진행 중인 오더 목록 (일반 오더 먼저, 예약은 시간 순) */
export async function myActiveOrders(myId: string): Promise<ActiveRow[]> {
  const { data } = await supabase.from('orders')
    .select('id, kind, status, reserved_at, pickup_area, dropoff_area, fare, payment_method')
    .eq('driver_id', myId).in('status', ['assigned', 'arrived_pickup', 'driving'])
    .order('reserved_at', { ascending: true, nullsFirst: true });
  return (data ?? []) as ActiveRow[];
}

/** 서류탁송 서류 상태·올린 서류·예시를 한 번에 */
async function loadDocs(orderId: string, capitalId: string | null): Promise<DocInfo | null> {
  const [m, rows, ex, cap] = await Promise.all([
    supabase.rpc('missing_documents', { p_order_id: orderId }),
    supabase.from('order_documents').select('slot, status, reason').eq('order_id', orderId),
    capitalId ? supabase.from('capital_examples').select('id, seq, title, path, is_cover').eq('company_id', capitalId).order('seq') : Promise.resolve({ data: [] }),
    capitalId ? supabase.from('capital_companies').select('name').eq('id', capitalId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (m.error || !m.data) return null;
  const d = m.data as { missing: string[]; rejected: { slot: string; reason: string }[]; pending: string[]; seal_count: boolean };
  return {
    state: { missing: d.missing, rejected: d.rejected, pending: d.pending, sealCount: d.seal_count },
    rows: (rows.data ?? []) as DocInfo['rows'],
    examples: (ex.data ?? []) as Example[],
    capitalName: (cap.data as { name: string } | null)?.name ?? null,
  };
}
