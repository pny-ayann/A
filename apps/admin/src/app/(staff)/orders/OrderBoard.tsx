'use client';
import type { OrderStatus } from '@takson/shared';
import type { REALTIME_SUBSCRIBE_STATES, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { KakaoMap, type MapMarker } from '@/components/KakaoMap';
import { OrderTable } from '@/components/OrderTable';
import { STATUS_LABEL, STATUS_ORDER, isUnassignedOverdue } from '@/lib/orders/labels';
import { applyChange, boardSince, filterOrders, ORDER_ROW_COLUMNS, type OrderChange, type OrderRow } from '@/lib/orders/realtime';
import { browserClient } from '@/lib/supabase/browser';
import { subscribeAuthed } from '@/lib/supabase/realtime';

type Named = { id: string; name: string };
export type DriverLocation = { driver_id: string; lat: number; lng: number; updated_at: string };
const ACTIVE: OrderStatus[] = ['assigned', 'arrived_pickup', 'driving'];
const input = 'rounded border px-2 py-1 text-sm';

export function OrderBoard({ initialOrders, companies, drivers, alertMin, initialLocations }: {
  initialOrders: OrderRow[];
  companies: Named[];
  drivers: Named[];
  alertMin: number;
  initialLocations: DriverLocation[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [locations, setLocations] = useState(() => new Map(initialLocations.map(l => [l.driver_id, l])));
  const [live, setLive] = useState<'connecting' | 'on' | 'off'>('connecting');
  const [tab, setTab] = useState<OrderStatus | 'all'>('all');
  const [date, setDate] = useState('');
  const [reservedOnly, setReservedOnly] = useState(false);
  const [payments, setPayments] = useState<OrderRow['payment_method'][]>([]);
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  // 관제 확인을 기다리는 서류가 있는 오더 (기사님이 출발을 못 하고 기다림)
  const [docWait, setDocWait] = useState<Set<string>>(new Set());

  // 미배차 경고는 1분마다 다시 계산
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 실시간 구독. 연결될 때마다 목록을 새로 받아 그 사이 놓친 변경을 메운다
  useEffect(() => {
    const supabase = browserClient();
    const refetchDocs = async () => {
      // 출발 전(수락함) 오더만: 운행이 시작됐거나 끝난 오더의 남은 대기 서류는 표시하지 않는다
      const { data } = await supabase.from('order_documents').select('order_id, orders!inner(status)')
        .eq('status', 'pending').eq('orders.status', 'arrived_pickup');
      if (data) setDocWait(new Set((data as { order_id: string }[]).map(d => d.order_id)));
    };
    const refetch = async () => {
      const { data } = await supabase.from('orders').select(ORDER_ROW_COLUMNS)
        .or(`status.in.(open,assigned,arrived_pickup,driving),created_at.gte.${boardSince(new Date())}`)
        .order('created_at', { ascending: false }).limit(500);
      if (data) setOrders(data as OrderRow[]);
      await refetchDocs();
    };
    return subscribeAuthed(supabase, () => supabase.channel('order-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },
        (p: RealtimePostgresChangesPayload<OrderRow>) => setOrders(list => applyChange(list, p as unknown as OrderChange)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_documents' }, () => void refetchDocs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, (p: RealtimePostgresChangesPayload<DriverLocation>) => {
        const row = (p.eventType === 'DELETE' ? p.old : p.new) as DriverLocation;
        setLocations(cur => {
          const next = new Map(cur);
          if (p.eventType === 'DELETE') next.delete(row.driver_id); else next.set(row.driver_id, row);
          return next;
        });
      })
      .subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
        if (status === 'SUBSCRIBED') { setLive('on'); void refetch(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setLive('off');
      }));
  }, []);

  const companyName = useMemo(() => {
    const m = new Map(companies.map(c => [c.id, c.name]));
    return (id: string) => m.get(id) ?? '?';
  }, [companies]);
  const driverName = useMemo(() => {
    const m = new Map(drivers.map(d => [d.id, d.name]));
    return (id: string | null) => (id ? m.get(id) ?? '?' : '');
  }, [drivers]);

  const nameOf = (o: OrderRow) => `${companyName(o.company_id)} ${driverName(o.driver_id)}`;
  const base = filterOrders(orders, { date, reservedOnly, payments, q, nameOf });
  const shown = tab === 'all' ? base : base.filter(o => o.status === tab);
  const lateCount = now ? base.filter(o => isUnassignedOverdue(o, now, alertMin)).length : 0;
  const selected = orders.find(o => o.id === selectedId) ?? null;

  const markers = useMemo(() => {
    const list: MapMarker[] = [];
    if (selected?.pickup_lat != null && selected.pickup_lng != null)
      list.push({ key: 'pickup', lat: selected.pickup_lat, lng: selected.pickup_lng, label: `출발 ${selected.pickup_area ?? ''}`, color: '#2563eb' });
    if (selected?.dropoff_lat != null && selected.dropoff_lng != null)
      list.push({ key: 'dropoff', lat: selected.dropoff_lat, lng: selected.dropoff_lng, label: `도착 ${selected.dropoff_area ?? ''}`, color: '#dc2626' });
    // 진행 중인 오더의 기사 위치
    const activeDrivers = new Set(orders.filter(o => o.driver_id && ACTIVE.includes(o.status)).map(o => o.driver_id!));
    for (const id of activeDrivers) {
      const l = locations.get(id);
      if (!l) continue;
      const mine = selected?.driver_id === id;
      list.push({ key: `d-${id}`, lat: l.lat, lng: l.lng, label: `기사 ${driverName(id)}`, color: mine ? '#ea580c' : '#16a34a' });
    }
    return list;
  }, [selected, orders, locations, driverName]);

  return (
    <div className="flex h-[calc(100vh-3rem)] gap-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex items-center gap-3">
          <h1 className="text-xl font-bold">오더 관제판</h1>
          <span className={`text-xs ${live === 'on' ? 'text-green-700' : live === 'off' ? 'text-red-600' : 'text-slate-500'}`}>
            {live === 'on' ? '● 실시간 연결됨' : live === 'off' ? '● 실시간 끊김 (새로고침해 주세요)' : '연결 중…'}
          </span>
          {lateCount > 0 && <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">배차 늦은 오더 {lateCount}건</span>}
        </div>

        <div className="mb-2 flex flex-wrap gap-1 text-sm" role="tablist">
          {(['all', ...STATUS_ORDER] as const).map(s => {
            const count = s === 'all' ? base.length : base.filter(o => o.status === s).length;
            return (
              <button key={s} type="button" role="tab" aria-selected={tab === s} onClick={() => setTab(s)}
                className={`rounded border px-3 py-1 ${tab === s ? 'bg-ink text-white' : 'bg-white hover:bg-slate-50'}`}>
                {s === 'all' ? '전체' : STATUS_LABEL[s]} {count}
              </button>
            );
          })}
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <input type="date" aria-label="날짜 (접수일·예약일)" title="접수일이나 예약일이 이 날인 오더" value={date}
            onChange={e => setDate(e.target.value)} className={input} />
          <input type="search" aria-label="오더 검색" value={q} onChange={e => setQ(e.target.value)}
            placeholder="검색: 번호·업체·주소·차량번호·기사" className={`${input} w-72`} />
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={reservedOnly} onChange={e => setReservedOnly(e.target.checked)} /> 예약만
          </label>
          {(['cash', 'postpaid'] as const).map(p => (
            <label key={p} className="flex items-center gap-1">
              <input type="checkbox" checked={payments.includes(p)}
                onChange={e => setPayments(cur => (e.target.checked ? [...cur, p] : cur.filter(x => x !== p)))} />
              {p === 'cash' ? '현금' : '후불'}
            </label>
          ))}
          {(q || date || reservedOnly || payments.length > 0) && (
            <button type="button" className="text-slate-500 underline"
              onClick={() => { setQ(''); setDate(''); setReservedOnly(false); setPayments([]); }}>필터 지우기</button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded border bg-white">
          <OrderTable orders={shown} companyName={companyName} driverName={driverName}
            selectedId={selectedId} onSelect={setSelectedId} now={now} alertMin={alertMin} docWait={docWait} />
        </div>
        <p className="mt-1 text-xs text-slate-500">진행 중인 오더와 최근 7일 오더를 보여 줘요. 줄을 누르면 지도에 표시돼요.</p>
      </div>

      <div className="flex w-[26%] min-w-[300px] shrink-0 flex-col">
        <div className="mb-2 text-sm text-slate-600">
          {selected
            ? `${companyName(selected.company_id)} · ${selected.pickup_area ?? '?'} → ${selected.dropoff_area ?? '?'}`
            : '오더를 고르면 출발·도착이 보여요. 초록 이름표는 운행 중인 기사예요.'}
        </div>
        <div className="min-h-0 flex-1">
          <KakaoMap markers={markers} fitKey={selectedId ?? 'none'} />
        </div>
      </div>
    </div>
  );
}
