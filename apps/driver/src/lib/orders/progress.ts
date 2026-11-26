import type { OrderKind, OrderStatus } from '@takson/shared';

export type Missing = { pickup: string[]; dropoff: string[] };
export type Action = { label: string; enabled: boolean; hint: string | null };
/** 서류탁송 서류 상태 (서버 missing_documents). 일반·대리는 null */
export type DocState = { missing: string[]; rejected: { slot: string; reason: string }[]; pending: string[]; sealCount: boolean } | null;

/**
 * 화면 아래 상태 버튼. 사진 잠금은 서버의 missing_photos 결과로만 판단하고,
 * 휴대폰에 남은 업로드 대기(이 오더의 모든 사진·영수증)가 있으면 잠그고 그것을 먼저 알려 준다.
 */
export function nextAction(status: OrderStatus, missing: Missing, pendingUploads: number, docs: DocState = null): Action | null {
  const gated = (label: string, phaseName: string, left: string[]): Action => {
    // 휴대폰에 남은 사진·영수증을 먼저 올려야 한다 (상태가 넘어가면 서버가 받지 않아 사라짐)
    if (pendingUploads > 0) return { label, enabled: false, hint: `업로드 대기 ${pendingUploads}장` };
    if (left.length === 0) return { label, enabled: true, hint: null };
    return { label, enabled: false, hint: `${phaseName} 사진 ${left.length}장이 더 필요해요` };
  };
  switch (status) {
    case 'assigned': return { label: '오더수락', enabled: true, hint: null };
    case 'arrived_pickup': {
      const a = gated('운행 시작', '출발', missing.pickup);
      if (!a.enabled || !docs) return a;
      // 서버 advance_order와 같은 순서: 인감 수량 → 빠짐·불인정 → 관제 확인 중
      const off = (hint: string) => ({ label: a.label, enabled: false, hint });
      if (!docs.sealCount) return off('인감 수량을 적어 주세요');
      const left = docs.missing.length + docs.rejected.length;
      if (left > 0) return off(`서류 ${left}장이 더 필요해요`);
      if (docs.pending.length > 0) return off(`관제가 서류 ${docs.pending.length}장을 확인 중이에요`);
      return a;
    }
    case 'driving': return gated('도착 완료', '도착', missing.dropoff);
    default: return null;
  }
}

/** 반납할 수 있는 남은 시간(ms). 지났으면 0 (설계 5.1) */
export function releaseRemainingMs(
  assignedAt: string, kind: OrderKind, // 서류탁송은 일반탁송과 같은 시간
  s: { release_min_takson: number; release_min_daeri: number }, now: Date,
): number {
  const windowMin = kind === 'daeri' ? s.release_min_daeri : s.release_min_takson;
  const left = new Date(assignedAt).getTime() + windowMin * 60_000 - now.getTime();
  // 휴대폰 시계가 서버보다 늦으면 정해진 시간보다 길게 보일 수 있으니 위아래를 막는다
  return Math.min(windowMin * 60_000, Math.max(0, left));
}
