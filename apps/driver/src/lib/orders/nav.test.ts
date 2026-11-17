import { expect, test } from 'vitest';
import { navLinks, telLink } from './nav';

test('좌표가 있으면 카카오맵·티맵 앱 길안내와 웹', () => {
  const name = '서울역 주차장';
  const e = encodeURIComponent(name);
  expect(navLinks({ lat: 37.5, lng: 127.0, name, address: '서울 중구' })).toEqual({
    kakao: 'kakaomap://route?ep=37.5,127&by=CAR',
    tmap: `tmap://route?goalname=${e}&goalx=127&goaly=37.5`,
    web: `https://map.kakao.com/link/to/${e},37.5,127`,
  });
});

test('좌표가 없으면 주소 검색 웹만', () => {
  const r = navLinks({ lat: null, lng: null, name: 'x', address: '서울 중구 세종대로 110' });
  expect(r.kakao).toBeNull();
  expect(r.tmap).toBeNull();
  expect(r.web).toBe(`https://map.kakao.com/link/search/${encodeURIComponent('서울 중구 세종대로 110')}`);
});

test('전화 링크', () => {
  expect(telLink('010-1234-5678')).toBe('tel:01012345678');
  expect(telLink(null)).toBeNull();
  expect(telLink('  ')).toBeNull();
});
