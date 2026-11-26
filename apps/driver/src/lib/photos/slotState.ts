/** 차량 사진 한 칸 상태: 올리는 중 → 관제 불인정(이유) → 없음 → 올림 */
export function photoSlotState(slot: string, missing: string[], queued: boolean, rejected: Record<string, string>) {
  if (queued) return { key: 'queued' as const, text: '대기' };
  if (rejected[slot]) return { key: 'rejected' as const, text: `✗ 다시 찍기 · ${rejected[slot]}` };
  if (missing.includes(slot)) return { key: 'empty' as const, text: '찍기' };
  return { key: 'done' as const, text: '✓ 올림' };
}
