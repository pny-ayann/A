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

/** 한국 날짜를 엑셀 날짜 칸 값으로 (시각 없이 그 날 0시 UTC) */
export function kstDay(iso: string): Date {
  const [y, m, d] = kstDate(iso).split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/** 내려받기 헤더. encodeURIComponent가 남기는 ' ( ) * 도 이스케이프하고(RFC 5987), 옛 프로그램용 영문 이름도 단다 */
export function contentDisposition(fileName: string, asciiFallback: string): string {
  const enc = encodeURIComponent(fileName).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${enc}`;
}

/** 줄의 요금·주유비 합이 합계와 같은지 (엑셀 줄과 합계를 따로 불러오는 사이 오더가 고쳐졌는지 확인) */
export function linesMatchTotal(lines: { fare: number; fuel: number }[], t: { supply: number; fuel: number }): boolean {
  return lines.reduce((a, l) => a + l.fare, 0) === t.supply && lines.reduce((a, l) => a + l.fuel, 0) === t.fuel;
}
