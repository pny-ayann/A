import { describe, expect, it } from 'vitest';
import { moveColumn, restoreOrder } from './columns';

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
