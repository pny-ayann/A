import type { OrderStatus } from '@takson/shared';

export type ListOrder = { id: string; status: OrderStatus; created_at: string; reserved_at: string | null };

const RUNNING: OrderStatus[] = ['assigned', 'arrived_pickup', 'driving'];
const DONE: OrderStatus[] = ['completed', 'cancelled'];

const group = (s: OrderStatus) => (RUNNING.includes(s) ? 0 : s === 'open' ? 1 : 2);
const t = (s: string | null) => (s ? new Date(s).getTime() : 0);

/** 진행 중(최근 접수순) → 접수 대기(바로 → 예약 시각순) → 완료·취소(최근순) */
export function sortOrders<T extends ListOrder>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const g = group(a.status) - group(b.status);
    if (g) return g;
    if (a.status === 'open' && b.status === 'open') {
      if (!a.reserved_at !== !b.reserved_at) return a.reserved_at ? 1 : -1;
      if (a.reserved_at && b.reserved_at) return t(a.reserved_at) - t(b.reserved_at);
    }
    return t(b.created_at) - t(a.created_at);
  });
}

export function splitTabs<T extends ListOrder>(rows: T[]): { active: T[]; done: T[] } {
  const sorted = sortOrders(rows);
  return { active: sorted.filter(r => !DONE.includes(r.status)), done: sorted.filter(r => DONE.includes(r.status)) };
}
