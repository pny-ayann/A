/** 업체 정산: 달('YYYY-MM') 처리와 입금 상태. 달은 모두 한국 시간 기준. */

const kstYmd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d); // YYYY-MM-DD

/** 지난 달 (한국 시간) */
export function lastMonth(now: Date): string {
  const [y, m] = kstYmd(now).split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** 올바른 'YYYY-MM'이면 그대로, 아니면 지난 달 */
export function parseMonth(s: string | undefined, now: Date): string {
  return s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : lastMonth(now);
}

export const monthStart = (m: string) => `${m}-01`;

export function monthRange(m: string): string {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${m}-01 ~ ${m}-${days}`;
}

export type PayState = { kind: 'paid' | 'changed' | 'unpaid' | 'none'; extra: number };

/** 입금 상태. extra = 체크 뒤 금액이 줄어 더 받은 돈 */
export function payState(total: number, paidAmount: number | null): PayState {
  if (paidAmount === null) return { kind: total > 0 ? 'unpaid' : 'none', extra: 0 };
  if (paidAmount === total) return { kind: 'paid', extra: 0 };
  return { kind: 'changed', extra: Math.max(0, paidAmount - total) };
}

export function statementFileName(company: string, m: string): string {
  return `정산서_${company.trim().replace(/[\\/:*?"<>|]/g, '_')}_${m}.xlsx`;
}

export const kstDate = (iso: string) => kstYmd(new Date(iso));
