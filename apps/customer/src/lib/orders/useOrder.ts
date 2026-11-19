import { subscribeAuthed, uniqueTopic, type OrderStatus } from '@takson/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';

export type Stop = {
  address: string; detail: string | null; area: string | null; lat: number | null; lng: number | null;
  contact_name: string | null; contact_phone: string | null;
};
export type Order = {
  id: string; company_id: string; kind: 'takson' | 'daeri'; status: OrderStatus; reserved_at: string | null;
  driver_id: string | null; assigned_at: string | null; fare: number; payment_method: 'cash' | 'postpaid'; distance_km: number | null;
  vehicle_number: string | null; vehicle_model: string | null; vehicle_color: string | null; transmission: 'auto' | 'manual' | null;
  driver_memo: string | null; created_at: string;
  pickup: Stop; dropoff: Stop; waypoints: Stop[]; missions: { id: string; name: string; extra_fare: number }[];
};
export type OrderEvent = {
  id: string; type: string; from_status: string | null; to_status: string | null; reason: string | null;
  data: Record<string, unknown> | null; created_at: string;
};
export type Driver = { name: string | null; phone: string | null };

export function stopOf(r: Record<string, unknown>, p: 'pickup' | 'dropoff'): Stop {
  return {
    address: r[`${p}_address`] as string, detail: r[`${p}_detail`] as string | null, area: r[`${p}_area`] as string | null,
    lat: r[`${p}_lat`] as number | null, lng: r[`${p}_lng`] as number | null,
    contact_name: r[`${p}_contact_name`] as string | null, contact_phone: r[`${p}_contact_phone`] as string | null,
  };
}

/** 내 업체 오더 하나 + 경유지·미션·기록·기사. 오더가 바뀌면 실시간으로 다시 읽는다 */
export function useOrder(id: string) {
  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [missing, setMissing] = useState(false);

  // 실시간 알림 하나에 여러 번 다시 읽을 수 있다. 늦게 끝난 옛 읽기가 새 화면을 덮지 않게 마지막 것만 쓴다
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    const { data: r, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
    if (mine !== seq.current) return;
    if (error) return; // 신호 문제: 화면은 그대로 두고 다음에
    if (!r) { setMissing(true); return; }
    const [wps, ms, ev, dr] = await Promise.all([
      supabase.from('order_waypoints').select('*').eq('order_id', id).order('seq'),
      supabase.from('order_missions').select('extra_fare, missions(id, name)').eq('order_id', id),
      supabase.from('order_events').select('id, type, from_status, to_status, reason, data, created_at').eq('order_id', id).order('created_at'),
      r.driver_id ? supabase.from('profiles').select('name, phone').eq('id', r.driver_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (mine !== seq.current) return;
    setOrder({
      ...(r as unknown as Order),
      pickup: stopOf(r, 'pickup'),
      dropoff: stopOf(r, 'dropoff'),
      waypoints: (wps.data ?? []) as unknown as Stop[],
      missions: (ms.data ?? []).map(m => {
        const x = m as unknown as { extra_fare: number; missions: { id: string; name: string } | null };
        return { id: x.missions?.id ?? '', name: x.missions?.name ?? '', extra_fare: x.extra_fare };
      }).filter(m => m.id),
    });
    setEvents((ev.data ?? []) as OrderEvent[]);
    setDriver((dr.data as Driver | null) ?? null);
    setMissing(false);
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => subscribeAuthed(supabase, () => supabase.channel(uniqueTopic(`c-order-${id}`))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, () => void load())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events', filter: `order_id=eq.${id}` }, () => void load())
    .subscribe()), [id, load]);

  return { order, events, driver, missing, reload: load };
}
