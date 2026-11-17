import type { OrderStatus } from '@takson/shared';
import type { OrderRow } from './realtime';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  open: '접수',
  assigned: '배차됨',
  arrived_pickup: '출발지 도착',
  driving: '운행 중',
  completed: '완료',
  cancelled: '취소',
};

export const STATUS_ORDER: OrderStatus[] = ['open', 'assigned', 'arrived_pickup', 'driving', 'completed', 'cancelled'];

/** 배차가 늦은 오더인지: 일반은 접수 후 alertMin분, 예약은 예약 alertMin분 전부터 */
export function isUnassignedOverdue(
  o: Pick<OrderRow, 'status' | 'created_at' | 'reserved_at'>,
  now: Date,
  alertMin: number,
): boolean {
  if (o.status !== 'open') return false;
  const ms = alertMin * 60_000;
  const deadline = o.reserved_at
    ? new Date(o.reserved_at).getTime() - ms
    : new Date(o.created_at).getTime() + ms;
  return now.getTime() >= deadline;
}
