/** 서류탁송 서류 칸 (slot: 'registration' | 'seal' | capital_examples.id) */
export function docSlotLabel(slot: string, examples: { id: string; title: string }[]): string {
  if (slot === 'registration') return '자동차등록증';
  if (slot === 'seal') return '인감(본인서명사실확인서)';
  return examples.find(e => e.id === slot)?.title ?? '지운 양식';
}

/** 관제가 고르는 불인정 이유 (그 밖은 '기타'로 직접 쓴다) */
export const REJECT_REASONS = ['잘림', '흐림', '빠진 칸', '도장·서명 없음', '용도 틀림(일반용·자동차공매용 아님)', '수량 다름'];

/** 관제 확인을 기다리는 서류가 있는지 */
export const awaitingReview = (docs: { status: string }[]) => docs.some(d => d.status === 'pending');
