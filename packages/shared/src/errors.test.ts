import { errorMessage } from './errors';

test('알려진 코드는 한국어', () => { expect(errorMessage('ALREADY_TAKEN')).toBe('이미 다른 기사가 잡은 오더예요.'); });
test('Postgres 오류 문장 안의 코드도 찾는다', () => {
  expect(errorMessage('error: PHOTOS_REQUIRED')).toBe('필수 사진 5장을 모두 올려 주세요.');
});
test('모르는 코드는 기본 문구', () => { expect(errorMessage('X')).toBe('처리하지 못했어요. 잠시 후 다시 시도해 주세요.'); });
