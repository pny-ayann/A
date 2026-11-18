/** 긴 변을 max로 줄일 크기. 이미 max 이하면 null (설계 6.3: 긴 변 1600px) */
export function resizeTarget(w: number, h: number, max = 1600): { width: number } | { height: number } | null {
  if (Math.max(w, h) <= max) return null;
  return w >= h ? { width: max } : { height: max };
}
