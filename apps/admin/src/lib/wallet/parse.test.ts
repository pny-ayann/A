import { expect, test } from 'vitest';
import { parseOpenings, parseWon } from './parse';

test('parseWon: 쉼표·원·빈칸을 허용하고 숫자가 아니면 null', () => {
  expect(parseWon('1,234원')).toBe(1234);
  expect(parseWon(' -5,000 ')).toBe(-5000);
  expect(parseWon('35000')).toBe(35000);
  expect(parseWon('abc')).toBeNull();
  expect(parseWon('')).toBeNull();
  expect(parseWon('1.5')).toBeNull();
});

test('parseOpenings: 기사별 시작 잔액, 빈 칸은 0, 잘못된 값은 그 기사 이름으로 안내', () => {
  const f = new FormData();
  f.append('driver', 'D1'); f.append('name_D1', '김기사'); f.append('amount_D1', '35,000');
  f.append('driver', 'D2'); f.append('name_D2', '박기사'); f.append('amount_D2', '');
  expect(parseOpenings(f)).toEqual([{ driver_id: 'D1', amount: 35000 }, { driver_id: 'D2', amount: 0 }]);
  f.set('amount_D2', '삼천');
  expect(parseOpenings(f)).toBe('금액을 숫자로 넣어 주세요: 박기사');
});
