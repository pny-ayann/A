import { expect, test } from 'vitest';
import { auditPageRange, diffRows, formatValue } from './audit';

test('바뀐 칸만, updated_at 제외', () => {
  expect(diffRows({ fare: 1, updated_at: 'a' }, { fare: 2, updated_at: 'b' })).toEqual([{ field: 'fare', from: 1, to: 2 }]);
});
test('INSERT(old 없음)는 새 값 전부', () => {
  expect(diffRows(null, { id: 'x', name: '가', updated_at: 'b' })).toEqual([
    { field: 'id', from: null, to: 'x' },
    { field: 'name', from: null, to: '가' },
  ]);
});
test('DELETE(new 없음)는 옛 값 전부', () => {
  expect(diffRows({ name: '가' }, null)).toEqual([{ field: 'name', from: '가', to: null }]);
});
test('객체·배열 값은 내용으로 비교', () => {
  expect(diffRows({ tags: ['a'], meta: { x: 1 } }, { tags: ['a'], meta: { x: 1 } })).toEqual([]);
  expect(diffRows({ tags: ['a'] }, { tags: ['a', 'b'] })).toEqual([{ field: 'tags', from: ['a'], to: ['a', 'b'] }]);
});
test('값 표시', () => {
  expect(formatValue(null)).toBe('(없음)');
  expect(formatValue(50000)).toBe('50000');
  expect(formatValue(true)).toBe('예');
  expect(formatValue({ a: 1 })).toBe('{"a":1}');
});
test('100개씩 페이지 범위 (1페이지부터)', () => {
  expect(auditPageRange(1)).toEqual([0, 99]);
  expect(auditPageRange(3)).toEqual([200, 299]);
  expect(auditPageRange(0)).toEqual([0, 99]);
  expect(auditPageRange(Number.NaN)).toEqual([0, 99]);
});
