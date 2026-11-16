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
