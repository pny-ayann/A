'use client';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { moveColumn, restoreOrder } from '@/lib/orders/columns';
import { STATUS_LABEL, isUnassignedOverdue, placeOf } from '@/lib/orders/labels';
import type { OrderRow } from '@/lib/orders/realtime';

const kst = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtTime = (iso: string) => kst.format(new Date(iso));

const STATUS_COLOR: Record<OrderRow['status'], string> = {
  open: 'bg-orange-100 text-orange-800', // 노랑은 번호판 전용
  assigned: 'bg-blue-100 text-blue-800',
  arrived_pickup: 'bg-indigo-100 text-indigo-800',
  driving: 'bg-violet-100 text-violet-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-slate-200 text-slate-600',
};

type Ctx = {
  companyName: (id: string) => string;
  driverName: (id: string | null) => string;
  late: boolean;
  /** 관제 확인을 기다리는 서류가 있음 */
  docWait: boolean;
};
type Col = { id: string; head: string; th?: string; td?: string; cell: (o: OrderRow, c: Ctx) => ReactNode };

const COLS: Col[] = [
  { id: 'no', head: '번호', td: 'font-mono', cell: o => o.order_no },
  { id: 'time', head: '시각', cell: o => o.reserved_at
    ? <span className="font-semibold text-orange-700" title={`접수 ${fmtTime(o.created_at)}`}>예약 {fmtTime(o.reserved_at)}</span>
    : fmtTime(o.created_at) },
  { id: 'company', head: '업체', cell: (o, c) => c.companyName(o.company_id) },
  // 남는 폭을 다 쓰고, 길면 말줄임(…) — 오더 한 개가 한 줄을 넘지 않게. 전체는 마우스를 올리면 보인다
  { id: 'route', head: '출발 → 도착', td: 'w-full max-w-0 min-w-[12rem]', cell: o => (
    <div className="truncate" title={`${o.pickup_address} → ${o.dropoff_address}`}>
      {o.kind === 'daeri' && <span className="mr-1 rounded bg-slate-200 px-1 text-xs">대리</span>}
      {o.kind === 'docs' && <span className="mr-1 rounded bg-orange-100 px-1 text-xs text-orange-800">서류</span>}
      {placeOf(o.pickup_area, o.pickup_address)} → {placeOf(o.dropoff_area, o.dropoff_address)}
    </div>
  ) },
  { id: 'plate', head: '차량', cell: o => o.vehicle_number && <span className="plate text-xs">{o.vehicle_number}</span> },
  { id: 'fare', head: '요금', th: 'text-right', td: 'text-right', cell: o => <>
    {o.fare.toLocaleString('ko-KR')}원 <span className="text-xs text-slate-500">{o.payment_method === 'cash' ? '현금' : '후불'}</span>
  </> },
  { id: 'driver', head: '기사', cell: (o, c) => c.driverName(o.driver_id) },
  { id: 'status', head: '상태', cell: (o, c) => <>
    <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
    {c.late && <span className="ml-1 text-xs font-semibold">배차 늦음</span>}
    {c.docWait && <span className="ml-1 rounded bg-orange-100 px-1 text-xs font-semibold text-orange-800">서류 확인 대기</span>}
  </> },
  { id: 'detail', head: '상세', cell: o => <>
    <Link href={`/orders/${o.id}`} onClick={e => e.stopPropagation()} className="text-road hover:underline">상세</Link>
  </> },
];
const IDS = COLS.map(c => c.id);
const BY_ID = new Map(COLS.map(c => [c.id, c]));
const KEY = 'orderBoard.columns';

/** 칸 순서: 제목을 끌어다 놓거나, 제목에서 ←/→ 키. 이 브라우저에 기억 */
function useColumnOrder() {
  const [order, setOrder] = useState(IDS);
  useEffect(() => {
    try { setOrder(restoreOrder(JSON.parse(localStorage.getItem(KEY) ?? 'null'), IDS)); } catch { /* 기본 순서 */ }
  }, []);
  const save = (next: string[]) => {
    setOrder(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 저장 못 해도 지금 화면은 바뀜 */ }
  };
  return { order, move: (from: string, to: string) => save(moveColumn(order, from, to)), reset: () => save(IDS) };
}

export function OrderTable({ orders, companyName, driverName, selectedId, onSelect, now, alertMin, docWait }: {
  orders: OrderRow[];
  companyName: (id: string) => string;
  driverName: (id: string | null) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: Date | null;
  alertMin: number;
  docWait: Set<string>;
}) {
  const { order, move, reset } = useColumnOrder();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  if (orders.length === 0) return <p className="p-6 text-center text-sm text-slate-500">조건에 맞는 오더가 없어요.</p>;
  const cols = order.map(id => BY_ID.get(id)!);
  const changed = order.join() !== IDS.join();
  const endDrag = () => { setDragging(null); setOver(null); };
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-100 text-left text-xs text-slate-600">
        <tr>
          {cols.map((c, i) => (
            <th key={c.id} draggable tabIndex={0}
              title="끌어서 칸 순서 바꾸기 (← → 키도 돼요)"
              aria-label={`${c.head} 칸. 끌거나 왼쪽·오른쪽 화살표로 옮기기`}
              onDragStart={e => { setDragging(c.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={e => { if (dragging) { e.preventDefault(); setOver(c.id); } }}
              onDrop={e => { e.preventDefault(); if (dragging) move(dragging, c.id); endDrag(); }}
              onDragEnd={endDrag}
              onKeyDown={e => {
                const to = e.key === 'ArrowLeft' ? cols[i - 1] : e.key === 'ArrowRight' ? cols[i + 1] : undefined;
                if (to) { e.preventDefault(); move(c.id, to.id); }
              }}
              className={`cursor-grab select-none px-2 py-1.5 whitespace-nowrap hover:bg-slate-200 ${c.th ?? ''} ${dragging === c.id ? 'opacity-40' : ''} ${over === c.id && dragging !== c.id ? 'bg-road-soft' : ''}`}>
              {c.id !== 'detail' ? c.head : changed
                ? <button type="button" onClick={reset} className="font-normal text-road underline">순서 처음대로</button>
                : null}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {orders.map(o => {
          const late = now !== null && isUnassignedOverdue(o, now, alertMin);
          const selected = o.id === selectedId;
          const ctx: Ctx = { companyName, driverName, late, docWait: docWait.has(o.id) };
          return (
            <tr key={o.id} onClick={() => onSelect(o.id)} aria-selected={selected} data-late={late || undefined}
              className={`cursor-pointer border-b ${selected ? 'bg-road-soft' : late ? 'bg-red-50 text-red-700' : 'hover:bg-slate-50'}`}>
              {cols.map(c => <td key={c.id} className={`px-2 py-1 whitespace-nowrap ${c.td ?? ''}`}>{c.cell(o, ctx)}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
