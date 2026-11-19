import { REQUIRED_SLOTS, type PhotoPhase, type PhotoSlot } from '@takson/shared';

export type PhotoRow = { id: string; phase: PhotoPhase; slot: PhotoSlot | null; path: string; taken_at: string };

export const SLOT_LABEL: Record<PhotoSlot, string> = { front: '앞', back: '뒤', left: '왼쪽', right: '오른쪽', dashboard: '계기판' };

/** 사진 화면 배치: 출발·도착은 5칸 고정 순서(없으면 null), 추가 사진은 찍은 시각순 */
export function photoGrid(rows: PhotoRow[]): { pickup: (PhotoRow | null)[]; dropoff: (PhotoRow | null)[]; extra: PhotoRow[] } {
  const slots = (phase: PhotoPhase) => REQUIRED_SLOTS.map(s => rows.find(r => r.phase === phase && r.slot === s) ?? null);
  return {
    pickup: slots('pickup'),
    dropoff: slots('dropoff'),
    extra: rows.filter(r => r.phase === 'extra').sort((a, b) => a.taken_at.localeCompare(b.taken_at)),
  };
}
