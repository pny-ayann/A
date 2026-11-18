import { expect, test } from 'vitest';
import { summarize } from './summary';

const now = new Date('2026-11-17T15:30:00Z'); // 한국 11/18 00:30

test('한국 날짜로 오늘을 센다 (자정 직후)', () => {
  const r = summarize([{ completedAt: '2026-11-17T15:10:00Z', fare: 30000 }], now);
  expect(r.today).toEqual({ count: 1, sum: 30000 });
  expect(r.month).toEqual({ count: 1, sum: 30000 });
});

test('한국 어제 23:50은 오늘이 아니지만 이번 달이다', () => {
  const r = summarize([{ completedAt: '2026-11-17T14:50:00Z', fare: 20000 }], now);
  expect(r.today).toEqual({ count: 0, sum: 0 });
  expect(r.month).toEqual({ count: 1, sum: 20000 });
});

test('UTC로는 10월이어도 한국 11/1이면 이번 달이다', () => {
  const r = summarize([{ completedAt: '2026-10-31T16:00:00Z', fare: 15000 }], now);
  expect(r.month).toEqual({ count: 1, sum: 15000 });
});

test('지난달과 작년 같은 달은 빼고 합친다', () => {
  const r = summarize([
    { completedAt: '2026-10-31T14:00:00Z', fare: 1 }, // 한국 10/31
    { completedAt: '2025-11-17T15:10:00Z', fare: 2 }, // 작년 11월
    { completedAt: '2026-11-17T15:10:00Z', fare: 30000 },
    { completedAt: '2026-11-02T03:00:00Z', fare: 10000 },
  ], now);
  expect(r.today).toEqual({ count: 1, sum: 30000 });
  expect(r.month).toEqual({ count: 2, sum: 40000 });
});
