import 'server-only';
import { parseAddress, parseDirections } from './parse';

export type LatLng = { lat: number; lng: number };

function restKey(): string | null {
  return process.env.KAKAO_REST_KEY || null;
}

async function kakaoGet(url: string): Promise<unknown> {
  const key = restKey();
  if (!key) throw new Error('KAKAO_REST_KEY 가 없어요.');
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, cache: 'no-store' });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    console.error(`[kakao] ${new URL(url).host} ${res.status} ${detail}`);
    throw new Error(`kakao ${res.status}`);
  }
  return res.json();
}

/** 주소 → 동네와 좌표. 못 찾으면 null */
export async function geocode(query: string) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?size=1&query=${encodeURIComponent(query)}`;
  return parseAddress(await kakaoGet(url));
}

/** 출발지 → (경유지) → 도착지 자동차 거리 km. 못 구하면 null */
export async function routeKm(points: LatLng[]) {
  if (points.length < 2) return null;
  const fmt = (p: LatLng) => `${p.lng},${p.lat}`;
  const origin = points[0]!;
  const dest = points[points.length - 1]!;
  const middle = points.slice(1, -1);
  const params = new URLSearchParams({ origin: fmt(origin), destination: fmt(dest), summary: 'true' });
  if (middle.length) params.set('waypoints', middle.map(fmt).join('|'));
  return parseDirections(await kakaoGet(`https://apis-navi.kakaomobility.com/v1/directions?${params}`));
}
