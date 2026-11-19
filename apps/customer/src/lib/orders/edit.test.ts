import { expect, test } from 'vitest';
import { editPatch, editRefusedMessage } from './edit';

test('editPatch: 고객이 바꾼 칸만 보낸다 (그 사이 관제가 바꾼 요금·메모를 옛 값으로 덮지 않게)', () => {
  const before = { fare: 35000, driver_memo: null, vehicle_number: '12가3456', reserved_at: null };
  const after = { fare: 35000, driver_memo: null, vehicle_number: '12가9999', reserved_at: null };
  expect(editPatch(before, after)).toEqual({ vehicle_number: '12가9999' });
});

test('editPatch: 아무것도 안 바꿨으면 빈 값', () => {
  expect(editPatch({ fare: 1, memo: null }, { fare: 1, memo: null })).toEqual({});
});

test('editPatch: 값을 지운 것(→ null)도 바뀐 것', () => {
  expect(editPatch({ driver_memo: '정문' }, { driver_memo: null })).toEqual({ driver_memo: null });
});

test('editRefusedMessage: 바뀐 줄이 0개일 때 지금 상태에 맞게 안내', () => {
  expect(editRefusedMessage('cancelled')).toBe('이 오더는 취소됐어요.');
  expect(editRefusedMessage('assigned')).toBe('그 사이 배차돼서 고치지 못했어요. 오더 화면의 "변경 요청"을 써 주세요.');
  expect(editRefusedMessage(null)).toBe('그 사이 배차돼서 고치지 못했어요. 오더 화면의 "변경 요청"을 써 주세요.');
});
