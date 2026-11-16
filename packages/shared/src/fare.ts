export type FareBand = { max_km: number; fare: number };

/** 거리 구간표로 기본 요금을 구하고 미션 추가 요금을 더한다. 마지막 구간을 넘으면 마지막 구간 요금. */
export function calcFare(distanceKm: number, bands: FareBand[], missionExtras: number[] = []): number {
  const sorted = [...bands].sort((a, b) => a.max_km - b.max_km);
  if (sorted.length === 0) throw new Error('NO_FARE_BANDS');
  const band = sorted.find(b => distanceKm <= b.max_km) ?? sorted[sorted.length - 1]!;
  return band.fare + missionExtras.reduce((s, x) => s + x, 0);
}
