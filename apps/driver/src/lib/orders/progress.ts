import type { OrderStatus } from '@takson/shared';

export type Missing = { pickup: string[]; dropoff: string[] };
export type Action = { label: string; enabled: boolean; hint: string | null };

/**
 * 화면 아래 상태 버튼. 사진 잠금은 서버의 missing_photos 결과로만 판단하고,
 * 휴대폰에 남은 업로드 대기(이 오더의 모든 사진·영수증)가 있으면 잠그고 그것을 먼저 알려 준다.
 */
export function nextAction(status: OrderStatus, missing: Missing, pendingUploads: number): Action | null {
  const gated = (label: string, phaseName: string, left: string[]): Action => {
    // 휴대폰에 남은 사진·영수증을 먼저 올려야 한다 (상태가 넘어가면 서버가 받지 않아 사라짐)
    if (pendingUploads > 0) return { label, enabled: false, hint: `업로드 대기 ${pendingUploads}장` };
    if (left.length === 0) return { label, enabled: true, hint: null };
    return { label, enabled: false, hint: `${phaseName} 사진 ${left.length}장이 더 필요해요` };
  };
  switch (status) {
    case 'assigned': return { label: '출발지 도착', enabled: true, hint: null };
    case 'arrived_pickup': return gated('운행 시작', '출발', missing.pickup);
    case 'driving': return gated('도착 완료', '도착', missing.dropoff);
    default: return null;
  }
}

/** 반납할 수 있는 남은 시간(ms). 지났으면 0 (설계 5.1) */
export function releaseRemainingMs(
  assignedAt: string, kind: 'takson' | 'daeri',
  s: { release_min_takson: number; release_min_daeri: number }, now: Date,
): number {
  const windowMin = kind === 'daeri' ? s.release_min_daeri : s.release_min_takson;
  const left = new Date(assignedAt).getTime() + windowMin * 60_000 - now.getTime();
  // 휴대폰 시계가 서버보다 늦으면 정해진 시간보다 길게 보일 수 있으니 위아래를 막는다
  return Math.min(windowMin * 60_000, Math.max(0, left));
}
