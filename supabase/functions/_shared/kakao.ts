// 카카오 응답 해석과 요청 검사 (순수 함수, Deno·Node 둘 다에서 돈다).
// 관제 웹 apps/admin/src/lib/kakao/parse.ts 와 같은 규칙 — 한쪽을 고치면 다른 쪽도 고친다.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;

/** 카카오 로컬 주소 검색 응답 → 동네(구 동)와 좌표. 못 찾으면 null */
export function parseAddress(json: unknown): { area: string; lat: number; lng: number } | null {
  if (!isObj(json) || !Array.isArray(json.documents)) return null;
  const doc: unknown = json.documents[0];
  if (!isObj(doc)) return null;
  const lat = Number(doc.y);
  const lng = Number(doc.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const region = isObj(doc.address) ? doc.address : isObj(doc.road_address) ? doc.road_address : null;
  if (!region) return null;
  const area = [region.region_2depth_name, region.region_3depth_name]
    .filter(s => typeof s === 'string' && s).join(' ');
  return { area, lat, lng };
}

/** 카카오모빌리티 길찾기 응답 → 거리 km(소수 1자리). 실패면 null */
export function parseDirections(json: unknown): number | null {
  if (!isObj(json) || !Array.isArray(json.routes)) return null;
  const route: unknown = json.routes[0];
  if (!isObj(route) || route.result_code !== 0 || !isObj(route.summary)) return null;
  const meters = route.summary.distance;
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;
  return Math.round(meters / 100) / 10;
}

export type LatLng = { lat: number; lng: number };
export type KakaoRequest = { op: 'geocode'; query: string } | { op: 'route'; points: LatLng[] };

const isPoint = (p: unknown): p is LatLng =>
  isObj(p) && typeof p.lat === 'number' && typeof p.lng === 'number'
  && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

/** 요청이 이상하면 이유(한국어), 괜찮으면 null */
export function checkRequest(body: unknown): string | null {
  if (!isObj(body)) return '요청이 비었어요.';
  if (body.op === 'geocode') {
    const q = body.query;
    if (typeof q !== 'string' || !q.trim() || q.length > 200) return '주소가 잘못됐어요.';
    return null;
  }
  if (body.op === 'route') {
    const pts = body.points;
    if (!Array.isArray(pts) || pts.length < 2 || pts.length > 7 || !pts.every(isPoint)) return '좌표가 잘못됐어요.';
    return null;
  }
  return '알 수 없는 요청이에요.';
}

/** 카카오 길찾기 URL (출발 → 경유 → 도착) */
export function directionsUrl(points: LatLng[]): string {
  const fmt = (p: LatLng) => `${p.lng},${p.lat}`;
  const params = new URLSearchParams({ origin: fmt(points[0]!), destination: fmt(points[points.length - 1]!), summary: 'true' });
  const middle = points.slice(1, -1);
  if (middle.length) params.set('waypoints', middle.map(fmt).join('|'));
  return `https://apis-navi.kakaomobility.com/v1/directions?${params}`;
}

export function geocodeUrl(query: string): string {
  return `https://dapi.kakao.com/v2/local/search/address.json?size=1&query=${encodeURIComponent(query)}`;
}

/** 카카오 중계를 쓸 수 있는 역할: 고객(오더 접수)과 관제만. 누구나 가입할 수 있는 기사 계정은 막는다(키 사용량 보호). */
export function allowedRole(role: unknown): boolean {
  return role === 'customer' || role === 'staff';
}
