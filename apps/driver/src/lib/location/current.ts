import * as Location from 'expo-location';

export type LatLng = { lat: number; lng: number };

/** 지금 위치 (권한 거부·실패·시간 초과면 null). 최근 위치가 2분 안이면 그걸 바로 쓴다. */
export async function currentPosition(timeoutMs = 10_000): Promise<LatLng | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    const granted = perm.granted || (perm.canAskAgain && (await Location.requestForegroundPermissionsAsync()).granted);
    if (!granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 120_000 });
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    const timeout = new Promise<null>(res => setTimeout(() => res(null), timeoutMs));
    const pos = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), timeout]);
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}
