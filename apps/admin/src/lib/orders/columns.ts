/** 관제판 표 칸 순서 (끌어서 바꾸고, 이 컴퓨터 브라우저에 기억) */

/** from 칸을 to 칸 자리로 옮긴다 */
export function moveColumn(order: string[], from: string, to: string): string[] {
  const i = order.indexOf(from), j = order.indexOf(to);
  if (i < 0 || j < 0 || i === j) return order;
  const next = order.filter(c => c !== from);
  next.splice(j, 0, from);
  return next;
}

/** 저장된 순서를 지금 칸 목록에 맞춘다: 없어진 칸은 빼고, 새로 생긴 칸은 끝에 */
export function restoreOrder(saved: unknown, ids: string[]): string[] {
  if (!Array.isArray(saved)) return ids;
  const kept = saved.filter((c): c is string => typeof c === 'string' && ids.includes(c));
  return [...new Set(kept), ...ids.filter(c => !kept.includes(c))];
}
