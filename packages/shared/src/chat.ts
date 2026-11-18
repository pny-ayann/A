/**
 * 읽음 처리 시각 = 본 메시지 중 마지막 것의 서버 시각(마이크로초 포함 원문). 메시지가 없으면 null(기록 안 함).
 * 내 기기 시계를 쓰면, 느릴 땐 방금 본 메시지가 '안 읽음'으로 남고 빠를 땐 그동안 온 새 문의를 놓친다.
 */
export function readMark(createdAts: string[]): string | null {
  let latest: string | null = null;
  for (const c of createdAts) if (latest === null || new Date(c).getTime() >= new Date(latest).getTime()) latest = c;
  return latest;
}
