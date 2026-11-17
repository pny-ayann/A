import { errorMessage } from '@takson/shared';
import { expect, test } from 'vitest';
import { validateSignup } from './signup';

const ok = { loginId: 'kim_driver', password: 'abcd1234', password2: 'abcd1234', name: '김기사', phone: '010-1234-5678' };

test('모두 맞으면 문제 없음', () => {
  expect(validateSignup(ok)).toBeNull();
  expect(validateSignup({ ...ok, phone: '01012345678' })).toBeNull();
});

test('아이디 규칙', () => {
  expect(validateSignup({ ...ok, loginId: 'Kim!' })).toBe(errorMessage('INVALID_LOGIN_ID'));
});

test('비밀번호', () => {
  expect(validateSignup({ ...ok, password: 'abc123', password2: 'abc123' })).toBe('비밀번호는 8자 이상이에요.');
  expect(validateSignup({ ...ok, password2: 'abcd12345' })).toBe('비밀번호가 서로 달라요.');
});

test('이름과 전화', () => {
  expect(validateSignup({ ...ok, name: '  ' })).toBe('이름을 적어 주세요.');
  expect(validateSignup({ ...ok, phone: '1234' })).toBe('전화번호를 확인해 주세요.');
});
