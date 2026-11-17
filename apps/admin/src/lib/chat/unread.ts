export type Thread = 'customer' | 'driver';
/** unread_counts() 한 줄: 오더·스레드별, 남이 쓴 안 읽은 메시지 수 */
export type UnreadRow = { order_id: string; thread: Thread; unread: number };

export const THREAD_LABEL: Record<Thread, string> = { customer: '고객 문의', driver: '기사 문의' };

export function totalUnread(rows: UnreadRow[]): number {
  return rows.reduce((sum, r) => sum + r.unread, 0);
}

export function unreadFor(rows: UnreadRow[], orderId: string, thread: Thread): number {
  return rows.find(r => r.order_id === orderId && r.thread === thread)?.unread ?? 0;
}

/** 오더별 합계 */
export function unreadByOrder(rows: UnreadRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.order_id, (m.get(r.order_id) ?? 0) + r.unread);
  return m;
}

/** 안 읽은 수가 바뀌었을 수 있다고 화면 곳곳(메뉴, 관제판)에 알리는 브라우저 이벤트 이름 */
export const UNREAD_CHANGED = 'takson:unread-changed';

/**
 * 읽음 처리 시각. 내 컴퓨터 시계가 서버보다 느리면 방금 본 메시지가 '안 읽음'으로 남으므로,
 * 마지막 메시지 시각(서버 값, 마이크로초 포함 원문)과 지금 중 늦은 쪽을 쓴다.
 */
export function readMark(createdAts: string[], now: Date): string {
  let latest: string | null = null;
  for (const c of createdAts) if (latest === null || new Date(c).getTime() >= new Date(latest).getTime()) latest = c;
  return latest !== null && new Date(latest).getTime() >= now.getTime() ? latest : now.toISOString();
}
