// 휴대폰 앱용 카카오 중계: 카카오 REST 키를 앱에 넣지 않고 여기(Supabase 비밀값 KAKAO_REST_KEY)에만 둔다.
// 로그인한 사용자만 부를 수 있다 (Supabase 기본 verify_jwt).
// POST { op: 'geocode', query } → { area, lat, lng } | null
// POST { op: 'route', points: [{lat,lng}, ...] } → { km: number | null }
import { checkRequest, directionsUrl, geocodeUrl, parseAddress, parseDirections, type KakaoRequest } from '../_shared/kakao.ts';

// 브라우저(웹 확인용)에서 부를 때 필요한 CORS 머리글. 휴대폰 앱은 상관없다.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST만 돼요.' }, 405);
  const key = Deno.env.get('KAKAO_REST_KEY');
  if (!key) return json({ error: 'NO_KEY' }, 500);
  const body: unknown = await req.json().catch(() => null);
  const problem = checkRequest(body);
  if (problem) return json({ error: problem }, 400);
  const r = body as KakaoRequest;
  const url = r.op === 'geocode' ? geocodeUrl(r.query) : directionsUrl(r.points);
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!res.ok) {
    console.error(`[kakao] ${new URL(url).host} ${res.status}`);
    return json({ error: 'KAKAO_FAILED' }, 502);
  }
  const data: unknown = await res.json();
  return r.op === 'geocode' ? json(parseAddress(data)) : json({ km: parseDirections(data) });
});
