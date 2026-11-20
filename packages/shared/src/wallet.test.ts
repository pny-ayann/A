import { expect, test } from 'vitest';
import { errorMessage } from './errors';
import { entryStatus, validateWithdraw } from './wallet';

test('validateWithdraw', () => {
  const s = { balance: 28000, withdrawable: 4000, pending: 24000 };
  expect(validateWithdraw(0, s, true)).toBe('금액을 1원 이상으로 넣어 주세요.');
  expect(validateWithdraw(1.5, s, true)).toBe('금액을 1원 이상으로 넣어 주세요.');
  expect(validateWithdraw(4001, s, true)).toBe('출금 가능 금액보다 많아요.');
  expect(validateWithdraw(4000, s, false)).toBe('받을 계좌를 먼저 등록해 주세요.');
  expect(validateWithdraw(4000, s, true)).toBeNull();
});

test('entryStatus: + 줄이 아직 출금 전이면 언제부터인지', () => {
  const e = { kind: 'postpaid', amount: 24000, withdrawable_at: '2026-11-20T03:00:00Z' };
  expect(entryStatus(e, new Date('2026-11-19T13:00:00Z'))).toBe('11/20 12:00부터 출금');
  expect(entryStatus(e, new Date('2026-11-20T03:00:00Z'))).toBeNull();
  expect(entryStatus({ kind: 'cash_fee', amount: -6000, withdrawable_at: null }, new Date())).toBeNull();
});

test('새 오류 코드 한국어', () => {
  expect(errorMessage('BALANCE_NEGATIVE')).toBe('충전금이 부족해요(마이너스). 충전 후 다시 시도해 주세요.');
  expect(errorMessage('OVER_WITHDRAWABLE')).toBe('출금 가능 금액보다 많아요.');
  expect(errorMessage('NO_BANK_ACCOUNT')).toBe('받을 계좌를 먼저 등록해 주세요.');
  expect(errorMessage('INVALID_AMOUNT')).toBe('금액을 1원 이상으로 넣어 주세요.');
  expect(errorMessage('ALREADY_PROCESSED')).toBe('이미 처리된 신청이에요.');
  expect(errorMessage('SETTLEMENT_OFF')).toBe('정산이 아직 켜지지 않았어요.');
});
