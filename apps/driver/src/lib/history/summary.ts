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

/**
 * 같은 오더의 완료 기록이 여러 번이면(관제가 완료를 되돌린 뒤 다시 완료) 가장 늦은 것 하나만 남긴다.
 * 순서는 완료 시각 최신순.
 */
export function latestPerOrder<T extends { orderId: string; completedAt: string }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const b = best.get(r.orderId);
    if (!b || Date.parse(r.completedAt) > Date.parse(b.completedAt)) best.set(r.orderId, r);
  }
  return [...best.values()].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
}
