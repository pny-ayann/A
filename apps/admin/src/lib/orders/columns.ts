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

export type SortDir = 'asc' | 'desc';
export type Sort = { col: string; dir: SortDir } | null;

/** 칸 제목을 누를 때: 같은 칸이면 오름↔내림, 다른 칸이면 오름부터 */
export function nextSort(cur: Sort, col: string): Sort {
  return { col, dir: cur?.col === col && cur.dir === 'asc' ? 'desc' : 'asc' };
}

/** 글자는 가나다순(숫자 섞여도 자연스럽게), 숫자는 크기순. 빈 값은 어느 방향이든 맨 뒤 */
export function sortRows<T>(rows: T[], key: (r: T) => string | number | null, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  const empty = (v: unknown) => v === null || v === '';
  return [...rows].sort((a, b) => {
    const x = key(a), y = key(b);
    if (empty(x) || empty(y)) return Number(empty(x)) - Number(empty(y));
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko', { numeric: true });
    return c * sign;
  });
}

/** 칸 너비(px): 너무 좁거나 넓지 않게 */
export const clampWidth = (w: number) => Math.min(600, Math.max(48, Math.round(w)));
