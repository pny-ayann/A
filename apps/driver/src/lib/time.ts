/** 한국 시간(UTC+9) 기준 달력 값. 휴대폰 시간대 설정과 상관없이 같게 보이도록 직접 계산한다. */
export function kstParts(iso: string | Date): { y: number; m: number; d: number; hh: number; mm: number } {
  const t = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), hh: t.getUTCHours(), mm: t.getUTCMinutes() };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** '11/18 14:00' */
export function kstShort(iso: string): string {
  const p = kstParts(iso);
  return `${p.m}/${p.d} ${pad(p.hh)}:${pad(p.mm)}`;
}

/** '35,000원' */
export function won(n: number): string {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;
}
