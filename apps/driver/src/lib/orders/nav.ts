/** 길안내 링크: 카카오맵 앱, 티맵 앱, 그리고 앱이 없을 때 쓰는 카카오맵 웹 */
export function navLinks(p: { lat: number | null; lng: number | null; name: string; address: string }) {
  if (p.lat === null || p.lng === null) {
    return { kakao: null, tmap: null, web: `https://map.kakao.com/link/search/${encodeURIComponent(p.address)}` };
  }
  const name = encodeURIComponent(p.name);
  return {
    kakao: `kakaomap://route?ep=${p.lat},${p.lng}&by=CAR`,
    tmap: `tmap://route?goalname=${name}&goalx=${p.lng}&goaly=${p.lat}`,
    web: `https://map.kakao.com/link/to/${name},${p.lat},${p.lng}`,
  };
}

/** 전화 걸기 링크 (숫자만) */
export function telLink(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits ? `tel:${digits}` : null;
}
