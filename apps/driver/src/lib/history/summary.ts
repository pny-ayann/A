import { kstParts } from '../time';

type Total = { count: number; sum: number };

/** 완료 운행을 한국 시간 기준 '오늘'과 '이번 달'로 묶어 건수와 요금 합계를 낸다 */
export function summarize(rows: { completedAt: string; fare: number }[], now: Date): { today: Total; month: Total } {
  const n = kstParts(now);
  const today: Total = { count: 0, sum: 0 };
  const month: Total = { count: 0, sum: 0 };
  for (const r of rows) {
    const p = kstParts(r.completedAt);
    if (p.y !== n.y || p.m !== n.m) continue;
    month.count++; month.sum += r.fare;
    if (p.d === n.d) { today.count++; today.sum += r.fare; }
  }
  return { today, month };
}
