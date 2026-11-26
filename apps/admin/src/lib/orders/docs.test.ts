import { expect, test } from 'vitest';
import { awaitingReview, docSlotLabel, REJECT_REASONS } from './docs';

const ex = [{ id: 'e1', title: '양도증명서' }];

test('서류 칸 이름', () => {
  expect(docSlotLabel('registration', ex)).toBe('자동차등록증');
  expect(docSlotLabel('seal', ex)).toBe('인감(본인서명사실확인서)');
  expect(docSlotLabel('e1', ex)).toBe('양도증명서');
});
test('지운 양식 이름', () => { expect(docSlotLabel('zz', ex)).toBe('지운 양식'); });
test('관제 확인 대기', () => {
  expect(awaitingReview([{ status: 'approved' }, { status: 'pending' }])).toBe(true);
  expect(awaitingReview([{ status: 'approved' }, { status: 'rejected' }])).toBe(false);
  expect(awaitingReview([])).toBe(false);
});
test('불인정 이유 목록', () => {
  expect(REJECT_REASONS).toEqual(['잘림', '흐림', '빠진 칸', '도장·서명 없음', '용도 틀림(일반용·자동차공매용 아님)', '수량 다름']);
});
