/**
 * 사진·영수증 업로드 대기열 (순수 함수). 신호가 없을 때 찍은 것을 휴대폰에 두었다가 차례로 올린다.
 * 저장(AsyncStorage)과 실제 업로드는 PhotoQueueProvider / uploader 가 한다.
 */
export type Slot = 'front' | 'back' | 'left' | 'right' | 'dashboard' | 'key';
export type Phase = 'pickup' | 'dropoff' | 'extra' | 'docs';

export type QueueItem = {
  id: string;
  kind: 'photo' | 'receipt';
  orderId: string;
  phase: Phase | null;
  /** 차량 칸(Slot) 또는 서류 칸('registration' | 'seal' | 캐피탈 예시 id) */
  slot: string | null;
  localUri: string;
  takenAt: string;
  lat: number | null;
  lng: number | null;
  amount: number | null;
  attempts: number;
  nextTryAt: number;
  /** 갤러리에서 고른 사진 (없으면 앱 카메라) */
  source?: 'camera' | 'gallery';
};

/** 서버 저장소 경로 규칙 (supabase/migrations/20261116000007_storage.sql 맨 위 주석) */
export function storagePath(i: QueueItem): { bucket: 'order-photos' | 'receipts'; path: string } {
  if (i.kind === 'receipt') return { bucket: 'receipts', path: `${i.orderId}/${i.id}.jpg` };
  return { bucket: 'order-photos', path: `${i.orderId}/${i.phase}/${i.slot ?? i.id}.jpg` };
}

const sameSlot = (a: QueueItem, b: QueueItem) =>
  a.kind === 'photo' && b.kind === 'photo' && a.slot !== null && a.slot === b.slot && a.orderId === b.orderId && a.phase === b.phase;

/** 넣기. 같은 오더·단계·칸 사진을 다시 찍었으면 옛것을 바꿔 끼운다 */
export function enqueue(q: QueueItem[], i: QueueItem): QueueItem[] {
  return [...q.filter(x => !sameSlot(x, i)), i];
}

export function due(q: QueueItem[], now: number): QueueItem[] {
  return q.filter(i => i.nextTryAt <= now);
}

/** 오더(와 단계)별 아직 안 올라간 수 */
export function pendingCount(q: QueueItem[], orderId: string, phase?: Phase): number {
  return q.filter(i => i.orderId === orderId && (phase === undefined || i.phase === phase)).length;
}

const BACKOFF = [5_000, 15_000, 60_000, 300_000];
export function backoffMs(attempts: number): number {
  return BACKOFF[Math.min(Math.max(attempts, 1), BACKOFF.length) - 1]!;
}

/** ok·drop은 빼고, retry는 다음 시도 시각을 늦춘다 */
export function applyResult(q: QueueItem[], id: string, r: 'ok' | 'retry' | 'drop', now: number): QueueItem[] {
  if (r !== 'retry') return q.filter(i => i.id !== id);
  return q.map(i => {
    if (i.id !== id) return i;
    const attempts = i.attempts + 1;
    return { ...i, attempts, nextTryAt: now + backoffMs(attempts) };
  });
}

/** 신호가 돌아왔을 때: 기다리던 것을 바로 다시 시도 (시도 횟수는 그대로) */
export function retryNow(q: QueueItem[], now: number): QueueItem[] {
  return q.map(i => ({ ...i, nextTryAt: Math.min(i.nextTryAt, now) }));
}

/** 권한 거부(오더가 회수·취소되어 더는 올릴 수 없음)는 포기, 나머지(신호·서버 문제)는 다시 시도 */
export function classifyError(e: { message?: string; statusCode?: string | number } | null): 'retry' | 'drop' {
  if (!e) return 'retry';
  if (String(e.statusCode ?? '') === '403') return 'drop';
  if (/row-level security|permission denied|unauthorized/i.test(e.message ?? '')) return 'drop';
  return 'retry';
}

/**
 * 권한 거부를 받았을 때 정말 버릴지. 신호가 나빠 로그인 갱신이 실패하면 익명으로 요청이 가서
 * 거부되는데, 이때 버리면 차량 상태 증거가 사라진다. 로그인돼 있고 오더가 더는 내 것이 아닐 때만 버린다.
 */
export function resolveDrop(s: { hasSession: boolean; stillMine: boolean }): 'retry' | 'drop' {
  return s.hasSession && !s.stillMine ? 'drop' : 'retry';
}

/** 대기열에 아직 있나 — 올리는 도중 같은 칸을 다시 찍으면 옛것은 빠지고 파일도 지워진다 */
export const stillQueued = (q: QueueItem[], id: string) => q.some(i => i.id === id);

/** 휴대폰에서 파일을 잃어 못 올린 칸 */
export type Lost = { orderId: string; phase: Phase | null; slot: string };

/** 이 오더·단계에서 파일을 잃었고 아직 서버에도 없는 칸 → 빨간 칸 이유 */
export function lostReasons(lost: Lost[], orderId: string, phase: Phase, missing: string[]): Record<string, string> {
  return Object.fromEntries(lost
    .filter(l => l.orderId === orderId && l.phase === phase && missing.includes(l.slot))
    .map(l => [l.slot, '파일 없음']));
}
