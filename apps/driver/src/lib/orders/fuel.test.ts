import { expect, test } from 'vitest';
import { parseAmount } from './fuel';

test('쉼표가 있는 금액을 숫자로 읽는다', () => {
  expect(parseAmount('45,000')).toBe(45000);
});

test('앞뒤 빈칸은 무시한다', () => {
  expect(parseAmount(' 12000 ')).toBe(12000);
});

test('0, 음수, 글자는 받지 않는다', () => {
  expect(parseAmount('0')).toBeNull();
  expect(parseAmount('-5000')).toBeNull();
  expect(parseAmount('abc')).toBeNull();
  expect(parseAmount('')).toBeNull();
  expect(parseAmount('12.5')).toBeNull();
});
