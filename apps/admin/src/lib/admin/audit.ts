export type FieldChange = { field: string; from: unknown; to: unknown };
type Row = Record<string, unknown>;

const IGNORED = new Set(['updated_at']);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** 감사 기록 한 줄의 바뀐 칸만 (updated_at 제외). 추가는 새 값 전부, 삭제는 옛 값 전부 */
export function diffRows(oldRow: Row | null, newRow: Row | null): FieldChange[] {
  const keys = [...new Set([...Object.keys(oldRow ?? {}), ...Object.keys(newRow ?? {})])];
  return keys
    .filter(k => !IGNORED.has(k))
    .map(k => ({ field: k, from: oldRow ? oldRow[k] ?? null : null, to: newRow ? newRow[k] ?? null : null }))
    .filter(c => !oldRow || !newRow || !same(c.from, c.to));
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '(없음)';
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export const AUDIT_PAGE_SIZE = 100;

/** 페이지 번호(1부터) → Supabase range(from, to) */
export function auditPageRange(page: number): [number, number] {
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const from = (p - 1) * AUDIT_PAGE_SIZE;
  return [from, from + AUDIT_PAGE_SIZE - 1];
}

export const TABLE_LABEL: Record<string, string> = {
  orders: '오더', companies: '업체', profiles: '사람(계정)', settings: '운영 설정', fare_bands: '요금표', missions: '미션',
};
export const ACTION_LABEL: Record<string, string> = { INSERT: '추가', UPDATE: '수정', DELETE: '삭제' };
