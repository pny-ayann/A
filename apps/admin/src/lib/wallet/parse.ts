/** '1,234원', '-5,000' → 정수 원. 숫자가 아니면 null */
export function parseWon(s: string): number | null {
  const t = s.replace(/[,\s원]/g, '');
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

/**
 * 정산 시작 폼: driver(여러 개), name_<id>, amount_<id> → [{driver_id, amount}].
 * 빈 칸은 0, 잘못된 값이면 그 기사 이름을 넣은 안내 문구.
 */
export function parseOpenings(form: FormData): { driver_id: string; amount: number }[] | string {
  const out: { driver_id: string; amount: number }[] = [];
  for (const v of form.getAll('driver')) {
    const id = String(v);
    const raw = String(form.get(`amount_${id}`) ?? '').trim();
    const amount = raw === '' ? 0 : parseWon(raw);
    if (amount === null) return `금액을 숫자로 넣어 주세요: ${String(form.get(`name_${id}`) ?? id)}`;
    out.push({ driver_id: id, amount });
  }
  return out;
}
