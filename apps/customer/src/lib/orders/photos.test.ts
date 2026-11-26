import { expect, test } from 'vitest';
import { photoGrid, type PhotoRow } from './photos';

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
