import type { OrderStatus } from '@takson/shared';

const LABEL: Record<OrderStatus, string> = {
  open: '접수 대기',
  assigned: '배차됨',
  arrived_pickup: '수락함',
  driving: '운행 중',
  completed: '완료',
  cancelled: '취소',
};

export function statusLabel(s: OrderStatus): string {
  return LABEL[s];
}

/** '방금', 'N분 전', 'N시간 전', 'N일 전' */
export function ago(at: string, now: Date): string {
  const sec = Math.max(0, (now.getTime() - new Date(at).getTime()) / 1000);
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return `${Math.floor(sec / 86400)}일 전`;
}
