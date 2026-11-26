import { expect, test } from 'vitest';
import { photoSlotState } from './slotState';

test('관제가 불인정한 차량 사진 칸은 이유를 보여 준다', () => {
  expect(photoSlotState('front', ['front'], false, { front: '잘림' })).toEqual({ key: 'rejected', text: '✗ 다시 찍기 · 잘림' });
});
test('올리는 중이 먼저, 없으면 찍기, 있으면 올림', () => {
  expect(photoSlotState('front', ['front'], true, { front: '잘림' })).toEqual({ key: 'queued', text: '대기' });
  expect(photoSlotState('back', ['back'], false, {})).toEqual({ key: 'empty', text: '찍기' });
  expect(photoSlotState('left', [], false, {})).toEqual({ key: 'done', text: '✓ 올림' });
});
