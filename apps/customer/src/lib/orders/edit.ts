/** 배차 전 수정: 화면을 연 뒤 고객이 바꾼 칸만 (그 사이 관제가 바꾼 값을 옛 값으로 덮지 않게) */
export function editPatch(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(after)) if (after[k] !== before[k]) out[k] = after[k];
  return out;
}

/** 수정이 한 줄도 안 바뀌었을 때(접수 대기가 아님) 지금 상태에 맞는 안내 */
export function editRefusedMessage(status: string | null): string {
  if (status === 'cancelled') return '이 오더는 취소됐어요.';
  return '그 사이 배차돼서 고치지 못했어요. 오더 화면의 "변경 요청"을 써 주세요.';
}
