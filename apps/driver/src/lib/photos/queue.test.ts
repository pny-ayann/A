import { expect, test } from 'vitest';
import { applyResult, backoffMs, lostReasons, stillQueued, classifyError, resolveDrop, due, enqueue, pendingCount, retryNow, storagePath, type QueueItem } from './queue';

const item = (p: Partial<QueueItem>): QueueItem => ({
  id: 'I1', kind: 'photo', orderId: 'O1', phase: 'pickup', slot: 'front', localUri: 'file:///q/I1.jpg',
  takenAt: '2026-11-17T03:00:00Z', lat: null, lng: null, amount: null, attempts: 0, nextTryAt: 0, ...p,
});

test('저장소 경로 (서버 저장소 규칙과 같음)', () => {
  expect(storagePath(item({}))).toEqual({ bucket: 'order-photos', path: 'O1/pickup/front.jpg' });
  expect(storagePath(item({ id: 'E9', phase: 'extra', slot: null }))).toEqual({ bucket: 'order-photos', path: 'O1/extra/E9.jpg' });
  expect(storagePath(item({ id: 'R1', kind: 'receipt', phase: null, slot: null, amount: 45000 })))
    .toEqual({ bucket: 'receipts', path: 'O1/R1.jpg' });
});

test('같은 칸을 다시 찍으면 옛것을 바꿔 끼운다', () => {
  let q = enqueue([], item({ id: 'A', localUri: 'a' }));
  q = enqueue(q, item({ id: 'B', localUri: 'b' }));
  expect(q).toHaveLength(1);
  expect(q[0]!.localUri).toBe('b');
});

test('추가 사진과 영수증은 쌓인다', () => {
  let q = enqueue([], item({ id: 'E1', phase: 'extra', slot: null }));
  q = enqueue(q, item({ id: 'E2', phase: 'extra', slot: null }));
  q = enqueue(q, item({ id: 'R1', kind: 'receipt', phase: null, slot: null, amount: 1 }));
  q = enqueue(q, item({ id: 'R2', kind: 'receipt', phase: null, slot: null, amount: 1 }));
  expect(q).toHaveLength(4);
});

test('재시도는 점점 늦게, 성공과 포기는 대기열에서 뺀다', () => {
  const now = 1_000_000;
  let q = [item({})];
  q = applyResult(q, 'I1', 'retry', now);
  expect(q[0]).toMatchObject({ attempts: 1, nextTryAt: now + 5_000 });
  q = applyResult(q, 'I1', 'retry', now);
  expect(q[0]).toMatchObject({ attempts: 2, nextTryAt: now + 15_000 });
  expect(applyResult(q, 'I1', 'ok', now)).toEqual([]);
  expect(applyResult(q, 'I1', 'drop', now)).toEqual([]);
});

test('대기 간격: 5초, 15초, 1분, 5분, 그 뒤로 5분', () => {
  expect([1, 2, 3, 4, 9].map(backoffMs)).toEqual([5_000, 15_000, 60_000, 300_000, 300_000]);
});

test('지금 올릴 차례인 것만', () => {
  const q = [item({ id: 'a', nextTryAt: 100 }), item({ id: 'b', slot: 'back', nextTryAt: 300 })];
  expect(due(q, 200).map(i => i.id)).toEqual(['a']);
});

test('오더·단계별 대기 수', () => {
  const q = [
    item({ id: 'a' }), item({ id: 'b', slot: 'back' }), item({ id: 'c', phase: 'dropoff' }),
    item({ id: 'd', orderId: 'O2' }), item({ id: 'r', kind: 'receipt', phase: null, slot: null, amount: 1 }),
  ];
  expect(pendingCount(q, 'O1', 'pickup')).toBe(2);
  expect(pendingCount(q, 'O1')).toBe(4);
});

test('권한 거부는 포기, 신호 문제는 재시도', () => {
  expect(classifyError({ statusCode: '403' })).toBe('drop');
  expect(classifyError({ statusCode: 403 })).toBe('drop');
  expect(classifyError({ message: 'new row violates row-level security policy for table "objects"' })).toBe('drop');
  expect(classifyError({ message: 'Network request failed' })).toBe('retry');
  expect(classifyError({ statusCode: '500' })).toBe('retry');
  expect(classifyError(null)).toBe('retry');
});

test('신호가 돌아오면 기다리던 것을 바로 다시 시도', () => {
  const q = [item({ id: 'a', attempts: 4, nextTryAt: 999_999 })];
  expect(retryNow(q, 10)[0]).toMatchObject({ attempts: 4, nextTryAt: 10 });
});

test('앱을 껐다 켜도(저장했다 읽어도) 똑같이 동작', () => {
  const q = [item({ id: 'a', nextTryAt: 5 }), item({ id: 'b', slot: 'back', nextTryAt: 50 })];
  const restored = JSON.parse(JSON.stringify(q)) as QueueItem[];
  expect(due(restored, 10).map(i => i.id)).toEqual(['a']);
  expect(pendingCount(restored, 'O1', 'pickup')).toBe(2);
});

test('권한 거부여도 로그인이 풀렸거나(신호 나빠 갱신 실패) 아직 내 오더면 사진을 버리지 않고 다시 시도', () => {
  expect(resolveDrop({ hasSession: false, stillMine: false })).toBe('retry');
  expect(resolveDrop({ hasSession: true, stillMine: true })).toBe('retry');
  expect(resolveDrop({ hasSession: true, stillMine: false })).toBe('drop');
});

test('서류는 docs 폴더 경로', () => {
  expect(storagePath(item({ phase: 'docs', slot: 'seal' }))).toEqual({ bucket: 'order-photos', path: 'O1/docs/seal.jpg' });
});
test('같은 서류 칸을 다시 찍으면 바꿔 끼운다', () => {
  const q = enqueue([item({ id: 'a', phase: 'docs', slot: 'seal' })], item({ id: 'b', phase: 'docs', slot: 'seal' }));
  expect(q.map(x => x.id)).toEqual(['b']);
});

test('올리는 도중 같은 칸을 다시 찍어 바뀐 사진은 더 올리지 않는다 (지운 파일이라 "파일 없음"이 잘못 뜸)', () => {
  const old = item({ id: 'OLD' });
  const q = enqueue([old], item({ id: 'NEW' }));
  expect(stillQueued(q, 'OLD')).toBe(false);
  expect(stillQueued(q, 'NEW')).toBe(true);
});

test('파일을 잃은 칸: 이 오더·단계에서 아직 서버에 없는 칸만 "파일 없음"', () => {
  const lost = [
    { orderId: 'O1', phase: 'pickup' as const, slot: 'left' },
    { orderId: 'O1', phase: 'pickup' as const, slot: 'back' },
    { orderId: 'O1', phase: 'dropoff' as const, slot: 'front' },
    { orderId: 'O2', phase: 'pickup' as const, slot: 'right' },
  ];
  expect(lostReasons(lost, 'O1', 'pickup', ['left', 'right'])).toEqual({ left: '파일 없음' });
});
