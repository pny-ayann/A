import { REQUIRED_SLOTS, type DocStatus, type PhotoPhase, type PhotoSlot } from '@takson/shared';

export type PhotoRow = { id: string; phase: PhotoPhase; slot: PhotoSlot | null; path: string; taken_at: string };

export const SLOT_LABEL: Record<PhotoSlot, string> = { front: '앞', back: '뒤', left: '왼쪽', right: '오른쪽', dashboard: '계기판', key: '차키' };

/** 사진 화면 배치: 출발·도착은 6칸 고정 순서(없으면 null), 추가 사진은 찍은 시각순 */
export function photoGrid(rows: PhotoRow[]): { pickup: (PhotoRow | null)[]; dropoff: (PhotoRow | null)[]; extra: PhotoRow[] } {
  const slots = (phase: PhotoPhase) => REQUIRED_SLOTS.map(s => rows.find(r => r.phase === phase && r.slot === s) ?? null);
  return {
    pickup: slots('pickup'),
    dropoff: slots('dropoff'),
    extra: rows.filter(r => r.phase === 'extra').sort((a, b) => a.taken_at.localeCompare(b.taken_at)),
  };
}

/** 서류탁송 서류 사진 한 칸 */
export type DocRow = { id: string; slot: string; path: string; status: DocStatus; reason: string | null; taken_at: string };

export const DOC_STATUS_TEXT: Record<DocStatus, string> = { pending: '관제 확인 중', approved: '✓ 인정', rejected: '✗ 불인정' };

/** 서류 칸 이름 (slot: 'registration' | 'seal' | 캐피탈 예시 id) */
export function docLabel(slot: string, examples: { id: string; title: string }[]): string {
  if (slot === 'registration') return '자동차등록증';
  if (slot === 'seal') return '인감(본인서명사실확인서)';
  return examples.find(e => e.id === slot)?.title ?? '캐피탈 서류';
}
