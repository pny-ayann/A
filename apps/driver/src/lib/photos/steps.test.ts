import { describe, expect, test } from 'vitest';
import { galleryRun, parseSteps, photoTodo, stepsParam } from './steps';

describe('이어 찍기 순서', () => {
  test('칸만 있으면 기본 단계로', () => {
    expect(parseSteps('front,back', 'pickup')).toEqual([{ phase: 'pickup', slot: 'front' }, { phase: 'pickup', slot: 'back' }]);
  });

  test('서류 다음 출발 사진으로 이어진다', () => {
    const p = stepsParam([{ phase: 'docs', slot: 'registration' }, { phase: 'pickup', slot: 'front' }]);
    expect(parseSteps(p, 'docs')).toEqual([{ phase: 'docs', slot: 'registration' }, { phase: 'pickup', slot: 'front' }]);
  });

  test('갤러리는 지금 단계(서류)까지만 채운다 — 서류와 차량 사진이 섞이지 않게', () => {
    expect(galleryRun(parseSteps('docs:a,docs:b,pickup:front', 'docs'))).toBe(2);
    expect(galleryRun(parseSteps('pickup:front,pickup:back', 'docs'))).toBe(2);
  });
});

test('찍어야 할 차량 칸: 비었거나 불인정·파일 없음, 올리는 중은 뺀다', () => {
  const todo = photoTodo(['front', 'back', 'left', 'right'], ['front', 'back', 'left'], s => s === 'back', { right: '흐림' });
  expect(todo).toEqual(['front', 'left', 'right']);
});
