import { describe, expect, it } from 'vitest';
import { clampWidth, moveColumn, nextSort, restoreOrder, sortRows } from './columns';

describe('moveColumn', () => {
  it('끌어 놓은 칸 자리로 옮긴다', () => {
    expect(moveColumn(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveColumn(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
  });
  it('같은 칸이나 없는 칸이면 그대로', () => {
    expect(moveColumn(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
    expect(moveColumn(['a', 'b'], 'x', 'a')).toEqual(['a', 'b']);
  });
});

describe('restoreOrder', () => {
  it('저장된 순서를 쓰되, 없어진 칸은 빼고 새 칸은 끝에 붙인다', () => {
    expect(restoreOrder(['c', 'x', 'a'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });
  it('저장된 게 이상하면 기본 순서', () => {
    expect(restoreOrder('망가짐', ['a', 'b'])).toEqual(['a', 'b']);
    expect(restoreOrder(null, ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('칸 정렬', () => {
  const rows = [{ n: '나', v: 2 }, { n: '가', v: 10 }, { n: '', v: 1 }];
  it('글자는 가나다순, 숫자는 크기순, 빈 값은 늘 맨 뒤', () => {
    expect(sortRows(rows, r => r.n, 'asc').map(r => r.n)).toEqual(['가', '나', '']);
    expect(sortRows(rows, r => r.n, 'desc').map(r => r.n)).toEqual(['나', '가', '']);
    expect(sortRows(rows, r => r.v, 'asc').map(r => r.v)).toEqual([1, 2, 10]);
    expect(sortRows(rows, r => r.v, 'desc').map(r => r.v)).toEqual([10, 2, 1]);
  });
  it('같은 칸을 누르면 오름↔내림, 다른 칸은 오름부터', () => {
    expect(nextSort(null, 'fare')).toEqual({ col: 'fare', dir: 'asc' });
    expect(nextSort({ col: 'fare', dir: 'asc' }, 'fare')).toEqual({ col: 'fare', dir: 'desc' });
    expect(nextSort({ col: 'fare', dir: 'desc' }, 'fare')).toEqual({ col: 'fare', dir: 'asc' });
    expect(nextSort({ col: 'fare', dir: 'desc' }, 'no')).toEqual({ col: 'no', dir: 'asc' });
  });
  it('칸 너비는 48~600px', () => {
    expect(clampWidth(10)).toBe(48);
    expect(clampWidth(200.6)).toBe(201);
    expect(clampWidth(9999)).toBe(600);
  });
});
