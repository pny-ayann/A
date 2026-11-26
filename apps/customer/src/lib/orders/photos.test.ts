import { expect, test } from 'vitest';
import { DOC_STATUS_TEXT, docLabel, photoGrid, type PhotoRow } from './photos';

const r = (phase: PhotoRow['phase'], slot: PhotoRow['slot'], taken: string, id = `${phase}-${slot}-${taken}`): PhotoRow =>
  ({ id, phase, slot, path: `${id}.jpg`, taken_at: taken });

test('칸 사진은 앞·뒤·왼·오·계기판·차키 순서, 없는 칸은 빈칸', () => {
  const g = photoGrid([
    r('pickup', 'dashboard', '2026-11-19T01:05:00Z'),
    r('pickup', 'front', '2026-11-19T01:00:00Z'),
    r('pickup', 'left', '2026-11-19T01:02:00Z'),
    r('dropoff', 'back', '2026-11-19T02:00:00Z'),
  ]);
  expect(g.pickup.map(x => x?.slot ?? null)).toEqual(['front', null, 'left', null, 'dashboard', null]);
  expect(g.dropoff.map(x => x?.slot ?? null)).toEqual([null, 'back', null, null, null, null]);
});

test('추가 사진은 찍은 시각순', () => {
  const g = photoGrid([
    r('extra', null, '2026-11-19T03:00:00Z', 'b'),
    r('extra', null, '2026-11-19T01:00:00Z', 'a'),
  ]);
  expect(g.extra.map(x => x.id)).toEqual(['a', 'b']);
  expect(g.pickup.every(x => x === null)).toBe(true);
});

test('서류 칸 이름과 상태 글자', () => {
  const ex = [{ id: 'e1', title: '양도증명서' }];
  expect(docLabel('registration', ex)).toBe('자동차등록증');
  expect(docLabel('seal', ex)).toBe('인감(본인서명사실확인서)');
  expect(docLabel('e1', ex)).toBe('양도증명서');
  expect(docLabel('x', ex)).toBe('캐피탈 서류');
  expect(DOC_STATUS_TEXT).toEqual({ pending: '관제 확인 중', approved: '✓ 인정', rejected: '✗ 불인정' });
});
