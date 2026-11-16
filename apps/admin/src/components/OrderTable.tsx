'use client';
import Link from 'next/link';
import { STATUS_LABEL, isUnassignedOverdue } from '@/lib/orders/labels';
import type { OrderRow } from '@/lib/orders/realtime';

const kst = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtTime = (iso: string) => kst.format(new Date(iso));

const STATUS_COLOR: Record<OrderRow['status'], string> = {
  open: 'bg-amber-100 text-amber-800',
  assigned: 'bg-blue-100 text-blue-800',
  arrived_pickup: 'bg-indigo-100 text-indigo-800',
  driving: 'bg-violet-100 text-violet-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-slate-200 text-slate-600',
};

export function OrderTable({ orders, companyName, driverName, selectedId, onSelect, now, alertMin }: {
  orders: OrderRow[];
  companyName: (id: string) => string;
  driverName: (id: string | null) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: Date | null;
  alertMin: number;
}) {
  if (orders.length === 0) return <p className="p-6 text-center text-sm text-slate-500">조건에 맞는 오더가 없어요.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-100 text-left text-xs text-slate-600">
        <tr>
          <th className="px-2 py-1.5">접수</th><th className="px-2">업체</th><th className="px-2">출발 → 도착</th>
          <th className="px-2">예약</th><th className="px-2 text-right">요금</th><th className="px-2">결제</th>
          <th className="px-2">기사</th><th className="px-2">상태</th><th className="px-2" />
        </tr>
      </thead>
      <tbody>
        {orders.map(o => {
          const late = now !== null && isUnassignedOverdue(o, now, alertMin);
          const selected = o.id === selectedId;
          return (
            <tr key={o.id} onClick={() => onSelect(o.id)} aria-selected={selected} data-late={late || undefined}
              className={`cursor-pointer border-b ${selected ? 'bg-blue-50' : late ? 'bg-red-50 text-red-700' : 'hover:bg-slate-50'}`}>
              <td className="px-2 py-1.5 whitespace-nowrap">{fmtTime(o.created_at)}</td>
              <td className="px-2">{companyName(o.company_id)}</td>
              <td className="px-2">
                {o.kind === 'daeri' && <span className="mr-1 rounded bg-slate-200 px-1 text-xs">대리</span>}
                {o.pickup_area ?? '?'} → {o.dropoff_area ?? '?'}
              </td>
              <td className="px-2 whitespace-nowrap">{o.reserved_at ? fmtTime(o.reserved_at) : ''}</td>
              <td className="px-2 text-right whitespace-nowrap">{o.fare.toLocaleString('ko-KR')}원</td>
              <td className="px-2">{o.payment_method === 'cash' ? '현금' : '후불'}</td>
              <td className="px-2">{driverName(o.driver_id)}</td>
              <td className="px-2 whitespace-nowrap">
                <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                {late && <span className="ml-1 text-xs font-semibold">배차 늦음</span>}
              </td>
              <td className="px-2"><Link href={`/orders/${o.id}`} onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline">상세</Link></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
