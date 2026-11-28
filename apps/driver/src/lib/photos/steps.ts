import type { Phase } from './queue';
import { photoSlotState } from './slotState';

/** 촬영 화면에서 찍을 한 칸 */
export type Step = { phase: Phase; slot: string };

/** 'front,back' 또는 'docs:registration,pickup:front' → 칸 목록 (단계가 없으면 기본 단계) */
export function parseSteps(slots: string, phase: Phase): Step[] {
  return slots.split(',').filter(Boolean).map(x => {
    const i = x.indexOf(':');
    return i < 0 ? { phase, slot: x } : { phase: x.slice(0, i) as Phase, slot: x.slice(i + 1) };
  });
}

export const stepsParam = (steps: Step[]) => steps.map(s => `${s.phase}:${s.slot}`).join(',');

/** 갤러리로 한 번에 채울 칸 수: 지금 단계와 같은 단계가 이어지는 데까지 (서류·차량 사진이 섞이지 않게) */
export function galleryRun(steps: Step[]): number {
  const n = steps.findIndex(s => s.phase !== steps[0]?.phase);
  return n < 0 ? steps.length : n;
}

/** 찍어야 할 차량 칸: 비었거나 다시 찍어야 하는 칸 (올리는 중은 빼고) */
export function photoTodo(slots: string[], missing: string[], isQueued: (s: string) => boolean, bad: Record<string, string>): string[] {
  return slots.filter(s => ['empty', 'rejected'].includes(photoSlotState(s, missing, isQueued(s), bad).key));
}
