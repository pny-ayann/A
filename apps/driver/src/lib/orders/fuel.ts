/** 주유 금액 입력 → 원 단위 양의 정수. "45,000" → 45000. 0·음수·소수·글자는 null */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/,/g, '');
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}
