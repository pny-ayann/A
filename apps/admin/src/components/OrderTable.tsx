'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StatusMenu } from './StatusMenu';
import { clampWidth, moveColumn, nextSort, restoreOrder, sortRows, type Sort } from '@/lib/orders/columns';
import { STATUS_LABEL, STATUS_ORDER, isUnassignedOverdue, placeOf } from '@/lib/orders/labels';
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
type Names = Pick<Ctx, 'companyName' | 'driverName'>;
type Col = {
  id: string; head: string; th?: string; td?: string; cell: (o: OrderRow, c: Ctx) => ReactNode;
  /** 제목을 눌러 정렬할 때 쓰는 값 */
  sort: (o: OrderRow, n: Names) => string | number | null;
};

const COLS: Col[] = [
  { id: 'no', head: '번호', td: 'font-mono', sort: o => o.order_no, cell: o => o.order_no },
  { id: 'time', head: '시각', sort: o => o.reserved_at ?? o.created_at, cell: o => o.reserved_at
    ? <span className="font-semibold text-orange-700" title={`접수 ${fmtTime(o.created_at)}`}>예약 {fmtTime(o.reserved_at)}</span>
    : fmtTime(o.created_at) },
  { id: 'company', head: '업체', sort: (o, n) => n.companyName(o.company_id), cell: (o, c) => c.companyName(o.company_id) },
  // 출발·도착은 남는 폭을 반씩 쓰고, 길면 말줄임(…) — 오더 한 개가 한 줄을 넘지 않게. 전체는 마우스를 올리면 보인다
  { id: 'pickup', head: '출발', td: 'w-1/2 max-w-0 min-w-[8rem]', sort: o => placeOf(o.pickup_area, o.pickup_address), cell: o => (
    <div className="truncate" title={o.pickup_address}>
      {o.kind === 'daeri' && <span className="mr-1 rounded bg-slate-200 px-1 text-xs">대리</span>}
      {o.kind === 'docs' && <span className="mr-1 rounded bg-orange-100 px-1 text-xs text-orange-800">★팩스★</span>}
      {placeOf(o.pickup_area, o.pickup_address)}
    </div>
  ) },
  { id: 'dropoff', head: '도착', td: 'w-1/2 max-w-0 min-w-[8rem]', sort: o => placeOf(o.dropoff_area, o.dropoff_address), cell: o => (
    <div className="truncate" title={o.dropoff_address}>{placeOf(o.dropoff_area, o.dropoff_address)}</div>
  ) },
  { id: 'plate', head: '차량', sort: o => o.vehicle_number, cell: o => o.vehicle_number && <span className="plate text-xs">{o.vehicle_number}</span> },
  { id: 'fare', head: '요금', th: 'text-right', td: 'text-right', sort: o => o.fare, cell: o => <>
    {o.fare.toLocaleString('ko-KR')}원 <span className="text-xs text-slate-500">{o.payment_method === 'cash' ? '현금' : '후불'}</span>
  </> },
  { id: 'driver', head: '기사', sort: (o, n) => n.driverName(o.driver_id), cell: (o, c) => c.driverName(o.driver_id) },
  { id: 'status', head: '상태', sort: o => STATUS_ORDER.indexOf(o.status), cell: (o, c) => <>
    <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
    {c.late && <span className="ml-1 text-xs font-semibold">배차 늦음</span>}
    {c.docWait && <span className="ml-1 rounded bg-orange-100 px-1 text-xs font-semibold text-orange-800">서류 확인 대기</span>}
  </> },
];
const IDS = COLS.map(c => c.id);
const BY_ID = new Map(COLS.map(c => [c.id, c]));
const KEY = 'orderBoard.columns';

/** 칸 순서: 제목을 끌어다 놓거나, 제목에서 ←/→ 키. 이 브라우저에 기억 */
function useColumnOrder() {
  const [order, setOrder] = useState(IDS);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      // 예전 '출발 → 도착' 한 칸은 그 자리에 출발·도착 두 칸으로
      const split = Array.isArray(saved) ? saved.flatMap(c => (c === 'route' ? ['pickup', 'dropoff'] : [c])) : saved;
      setOrder(restoreOrder(split, IDS));
    } catch { /* 기본 순서 */ }
  }, []);
  const save = (next: string[]) => {
    setOrder(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 저장 못 해도 지금 화면은 바뀜 */ }
  };
  return { order, move: (from: string, to: string) => save(moveColumn(order, from, to)), reset: () => save(IDS) };
}

const WKEY = 'orderBoard.widths';

/** 칸 너비(px): 제목 오른쪽 끝을 끌거나, 그 손잡이에서 ←/→ 키. 이 브라우저에 기억 */
function useColumnWidths() {
  const [widths, setWidths] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(WKEY) ?? 'null');
      if (saved && typeof saved === 'object') setWidths(saved as Record<string, number>);
    } catch { /* 기본 너비 */ }
  }, []);
  const save = (next: Record<string, number>) => {
    setWidths(next);
    try { localStorage.setItem(WKEY, JSON.stringify(next)); } catch { /* 저장 못 해도 지금 화면은 바뀜 */ }
  };
  return { widths, setWidths, save };
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
  const router = useRouter();
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuOrder = menu && orders.find(o => o.id === menu.id);
  const [sort, setSort] = useState<Sort>(null);
  const { widths, setWidths, save: saveWidths } = useColumnWidths();
  if (orders.length === 0) return <p className="p-6 text-center text-sm text-slate-500">조건에 맞는 오더가 없어요.</p>;
  const cols = order.map(id => BY_ID.get(id)!);
  const changed = order.join() !== IDS.join() || Object.keys(widths).length > 0;
  const names: Names = { companyName, driverName };
  const sortCol = sort && BY_ID.get(sort.col);
  const rows = sort && sortCol ? sortRows(orders, o => sortCol.sort(o, names), sort.dir) : orders;
  const sized = (id: string) => (widths[id] ? { width: widths[id], minWidth: widths[id], maxWidth: widths[id] } : undefined);

  // 칸 오른쪽 끝 손잡이를 끌어 너비 바꾸기 (놓으면 기억)
  function startResize(e: React.PointerEvent<HTMLSpanElement>, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = e.currentTarget.parentElement!.getBoundingClientRect().width;
    let last = widths;
    const move = (ev: PointerEvent) => { last = { ...widths, [id]: clampWidth(startW + ev.clientX - startX) }; setWidths(last); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); saveWidths(last); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  const endDrag = () => { setDragging(null); setOver(null); };
  return (
    <>
    {changed && (
      <div className="px-2 py-1 text-right text-xs">
        <button type="button" onClick={() => { reset(); saveWidths({}); }} className="text-road underline">칸 순서·너비 처음대로</button>
      </div>
    )}
    <table className="w-full text-sm">
      <caption className="sr-only">칸 제목을 누르면 정렬, 끌면 순서 바꾸기, 제목 오른쪽 끝을 끌면 너비 조절. 줄을 한 번 누르면 지도에 표시, 두 번 누르면(또는 Enter) 상세, 오른쪽 클릭하면 상태 바꾸기</caption>
      <thead className="bg-slate-100 text-left text-xs text-slate-600">
        <tr>
          {cols.map((c, i) => (
            <th key={c.id} draggable tabIndex={0} style={sized(c.id)}
              title="누르면 정렬 · 끌면 칸 순서 바꾸기 (← → 키도 돼요)"
              aria-label={`${c.head} 칸. 누르면 정렬, 끌거나 왼쪽·오른쪽 화살표로 옮기기`}
              aria-sort={sort?.col === c.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
              onClick={() => setSort(cur => nextSort(cur, c.id))}
              onDragStart={e => { setDragging(c.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={e => { if (dragging) { e.preventDefault(); setOver(c.id); } }}
              onDrop={e => { e.preventDefault(); if (dragging) move(dragging, c.id); endDrag(); }}
              onDragEnd={endDrag}
              onKeyDown={e => {
                const to = e.key === 'ArrowLeft' ? cols[i - 1] : e.key === 'ArrowRight' ? cols[i + 1] : undefined;
                if (to) { e.preventDefault(); move(c.id, to.id); }
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSort(cur => nextSort(cur, c.id)); }
              }}
              className={`relative cursor-pointer select-none px-2 py-1.5 whitespace-nowrap hover:bg-slate-200 ${c.th ?? ''} ${dragging === c.id ? 'opacity-40' : ''} ${over === c.id && dragging !== c.id ? 'bg-road-soft' : ''}`}>
              {c.head}
              {sort?.col === c.id && <span aria-hidden className="ml-1">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
              <span role="separator" aria-orientation="vertical" aria-label={`${c.head} 칸 너비 (← → 키)`} tabIndex={0}
                title="끌어서 너비 조절"
                onPointerDown={e => startResize(e, c.id)}
                onClick={e => e.stopPropagation()}
                onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                onKeyDown={e => {
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                  e.preventDefault(); e.stopPropagation();
                  const w = widths[c.id] ?? e.currentTarget.parentElement!.getBoundingClientRect().width;
                  saveWidths({ ...widths, [c.id]: clampWidth(w + (e.key === 'ArrowRight' ? 16 : -16)) });
                }}
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-road focus:bg-road" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(o => {
          const late = now !== null && isUnassignedOverdue(o, now, alertMin);
          const selected = o.id === selectedId;
          const ctx: Ctx = { companyName, driverName, late, docWait: docWait.has(o.id) };
          return (
            <tr key={o.id} tabIndex={0} title="두 번 누르면 상세, 오른쪽 클릭하면 상태 바꾸기"
              onClick={() => onSelect(o.id)}
              onDoubleClick={() => router.push(`/orders/${o.id}`)}
              onKeyDown={e => { if (e.key === 'Enter') router.push(`/orders/${o.id}`); }}
              onContextMenu={e => {
                e.preventDefault();
                onSelect(o.id);
                // 키보드(메뉴 키)로 열면 마우스 위치가 0이라 줄 위치에 띄운다
                const r = e.currentTarget.getBoundingClientRect();
                setMenu({ id: o.id, x: e.clientX || r.left + 40, y: e.clientY || r.bottom });
              }}
              aria-selected={selected} data-late={late || undefined}
              className={`cursor-pointer border-b ${selected ? 'bg-road-soft' : late ? 'bg-red-50 text-red-700' : 'hover:bg-slate-50'}`}>
              {cols.map(c => (
                <td key={c.id} style={sized(c.id)}
                  className={`px-2 py-1 whitespace-nowrap ${c.td ?? ''} ${widths[c.id] ? 'overflow-hidden text-ellipsis' : ''}`}>
                  {c.cell(o, ctx)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
    {menu && menuOrder && <StatusMenu key={menu.id} order={menuOrder} x={menu.x} y={menu.y} onClose={closeMenu} />}
    </>
  );
}
