'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { THREAD_LABEL } from '@/lib/chat/unread';
import { useUnread } from '@/lib/chat/useUnread';
import { browserClient } from '@/lib/supabase/browser';

type OrderBrief = { id: string; pickup_area: string | null; dropoff_area: string | null; companies: { name: string } | null };

/** 안 읽은 문의가 있는 오더 목록 (실시간) */
export function InquiryList() {
  const rows = useUnread();
  const [orders, setOrders] = useState<Map<string, OrderBrief>>(new Map());
  const ids = [...new Set(rows.map(r => r.order_id))].sort().join(',');

  useEffect(() => {
    if (!ids) return;
    void browserClient().from('orders').select('id, pickup_area, dropoff_area, companies(name)').in('id', ids.split(','))
      .then(({ data }: { data: unknown[] | null }) => { if (data) setOrders(new Map((data as unknown as OrderBrief[]).map(o => [o.id, o]))); });
  }, [ids]);

  if (rows.length === 0) return <p className="text-sm text-slate-500">안 읽은 문의가 없어요.</p>;
  return (
    <ul className="divide-y rounded border bg-white text-sm">
      {rows.map(r => {
        const o = orders.get(r.order_id);
        return (
          <li key={`${r.order_id}-${r.thread}`}>
            <Link href={`/orders/${r.order_id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50">
              <span className="w-20 text-slate-500">{THREAD_LABEL[r.thread]}</span>
              <span className="flex-1">{o ? `${o.companies?.name ?? '?'} · ${o.pickup_area ?? '?'} → ${o.dropoff_area ?? '?'}` : '불러오는 중…'}</span>
              <span className="rounded-full bg-red-600 px-2 text-xs font-semibold text-white">{r.unread}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
