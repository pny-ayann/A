import { expect, test } from 'vitest';
import { checkRequest, parseAddress, parseDirections } from './kakao';

test('카카오 길찾기 12,345m → 12.3km', () => {
  expect(parseDirections({ routes: [{ result_code: 0, summary: { distance: 12345 } }] })).toBe(12.3);
});
test('길찾기 실패 코드면 null', () => {
  expect(parseDirections({ routes: [{ result_code: 104, result_msg: '출발지와 도착지가 너무 가까움' }] })).toBeNull();
});
test('응답 모양이 이상하면 null', () => {
  expect(parseDirections({})).toBeNull();
  expect(parseDirections(null)).toBeNull();
  expect(parseDirections({ routes: [{ result_code: 0, summary: { distance: 'x' } }] })).toBeNull();
  expect(parseAddress(null)).toBeNull();
  expect(parseAddress({ documents: [{ x: 'a', y: 'b', address: null }] })).toBeNull();
});
test('주소 → 동네와 좌표', () => {
  expect(parseAddress({ documents: [{ x: '127.0276', y: '37.4979', address: { region_2depth_name: '강남구', region_3depth_name: '역삼동' } }] }))
    .toEqual({ area: '강남구 역삼동', lat: 37.4979, lng: 127.0276 });
});
test('지번 정보가 없으면 도로명 주소의 동네를 쓴다', () => {
  expect(parseAddress({ documents: [{ x: '127', y: '37', address: null, road_address: { region_2depth_name: '중구', region_3depth_name: '태평로1가' } }] }))
    .toEqual({ area: '중구 태평로1가', lat: 37, lng: 127 });
});
test('결과 없는 주소는 null', () => { expect(parseAddress({ documents: [] })).toBeNull(); });

test('요청 검사: 정상 주소 검색과 거리 요청은 통과', () => {
  expect(checkRequest({ op: 'geocode', query: '서울 강남구 테헤란로 152' })).toBeNull();
  expect(checkRequest({ op: 'route', points: [{ lat: 37.5, lng: 127 }, { lat: 37.2, lng: 127.1 }] })).toBeNull();
});

test('요청 검사: 이상한 요청은 이유를 돌려준다', () => {
  expect(checkRequest(null)).toBeTypeOf('string');
  expect(checkRequest({})).toBeTypeOf('string');
  expect(checkRequest({ op: 'delete' })).toBeTypeOf('string');
  expect(checkRequest({ op: 'geocode', query: '' })).toBeTypeOf('string');
  expect(checkRequest({ op: 'geocode', query: 'a'.repeat(201) })).toBeTypeOf('string');
  const p = { lat: 37.5, lng: 127 };
  expect(checkRequest({ op: 'route', points: [p] })).toBeTypeOf('string');
  expect(checkRequest({ op: 'route', points: Array(8).fill(p) })).toBeTypeOf('string');
  expect(checkRequest({ op: 'route', points: [p, { lat: 999, lng: 127 }] })).toBeTypeOf('string');
  expect(checkRequest({ op: 'route', points: [p, { lat: '37', lng: 127 }] })).toBeTypeOf('string');
});
