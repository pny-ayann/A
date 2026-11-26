import { errorMessage } from './errors';

test('알려진 코드는 한국어', () => { expect(errorMessage('ALREADY_TAKEN')).toBe('이미 다른 기사가 잡은 오더예요.'); });
test('Postgres 오류 문장 안의 코드도 찾는다', () => {
  expect(errorMessage('error: PHOTOS_REQUIRED')).toBe('필수 사진을 모두 올려 주세요.');
});
test('모르는 코드는 기본 문구', () => { expect(errorMessage('X')).toBe('처리하지 못했어요. 잠시 후 다시 시도해 주세요.'); });
test('꺼진 미션', () => { expect(errorMessage('INVALID_MISSION')).toBe('꺼진 미션이 있어요. 다시 골라 주세요.'); });
test('서류탁송 오류 문구', () => {
  expect(errorMessage('CAPITAL_REQUIRED')).toBe('캐피탈 회사를 골라 주세요.');
  expect(errorMessage('SEAL_COUNT_REQUIRED')).toBe('인감 수량을 적어 주세요.');
  expect(errorMessage('DOCS_REQUIRED')).toBe('빠졌거나 다시 찍어야 할 서류가 있어요.');
  expect(errorMessage('DOCS_NOT_APPROVED')).toBe('관제가 서류를 확인하는 중이에요. 확인되면 출발할 수 있어요.');
});
