import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { myActiveOrders } from '../orders/useOrder';
import { supabase } from '../supabase';
import { currentPosition } from './current';
import { FOREGROUND_INTERVAL_MS, FOREGROUND_SERVICE, LOCATION_OPTIONS, LOCATION_TASK, shouldTrackInBackground } from './policy';

type Perm = 'granted' | 'denied' | 'undetermined';
type Ctx = {
  /** 진행 중 오더 수 (30초마다 갱신) */
  activeCount: number;
  /** '항상 허용' 권한 상태. 웹은 늘 granted로 본다(백그라운드 없음) */
  background: Perm;
  /** 다시 물을 수 있는지 (아니면 설정 화면으로 안내) */
  canAskBackground: boolean;
  requestBackground: () => Promise<void>;
};

const LocationCtx = createContext<Ctx>({ activeCount: 0, background: 'granted', canAskBackground: false, requestBackground: async () => {} });

const toPerm = (s: Location.PermissionStatus): Perm => (s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'undetermined');

/**
 * 기사 위치 보내기.
 * - 앱이 앞에 있을 때: 30초마다 report_location (상태 버튼을 누를 때도 위치가 함께 감)
 * - 진행 중 오더가 있고 '항상 허용'이면: 화면이 꺼져도 보내는 작업을 켠다. 오더가 없거나 로그아웃이면 끈다.
 */
export function LocationReporter({ children }: { children: ReactNode }) {
  const { session, profile, route } = useAuth();
  const active = route === 'home' && !!session && !!profile;
  const [activeCount, setActiveCount] = useState(0);
  const [background, setBackground] = useState<Perm>(Platform.OS === 'web' ? 'granted' : 'undetermined');
  const [canAskBackground, setCanAsk] = useState(true);

  const readBackground = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const p = await Location.getBackgroundPermissionsAsync().catch(() => null);
    if (p) { setBackground(toPerm(p.status)); setCanAsk(p.canAskAgain); }
  }, []);

  // 앱이 앞에 있는 동안 30초마다: 위치 보내기 + 진행 중 오더 수 확인
  useEffect(() => {
    if (!active || !profile) { setActiveCount(0); return; }
    let alive = true;
    const tick = async () => {
      if (AppState.currentState !== 'active') return;
      const [pos, rows] = await Promise.all([currentPosition(), myActiveOrders(profile.id).catch(() => null)]);
      if (!alive) return;
      if (rows) setActiveCount(rows.length);
      if (pos) await supabase.rpc('report_location', { p_lat: pos.lat, p_lng: pos.lng });
    };
    void tick();
    void readBackground();
    const t = setInterval(() => void tick(), FOREGROUND_INTERVAL_MS);
    const app = AppState.addEventListener('change', s => { if (s === 'active') { void tick(); void readBackground(); } });
    return () => { alive = false; clearInterval(t); app.remove(); };
  }, [active, profile, readBackground]);

  // 화면 꺼짐 위치 작업 켜고 끄기
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const want = shouldTrackInBackground({ hasSession: active, activeOrderCount: activeCount, permission: background });
    void (async () => {
      try {
        const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
        if (want && !running) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK, { ...LOCATION_OPTIONS, foregroundService: FOREGROUND_SERVICE });
        } else if (!want && running) {
          await Location.stopLocationUpdatesAsync(LOCATION_TASK);
        }
      } catch {
        // Expo Go 등 백그라운드 작업을 못 쓰는 환경: 앱 켜짐 보내기만 한다
      }
    })();
  }, [active, activeCount, background]);

  const requestBackground = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (!fg.granted) { setBackground('denied'); setCanAsk(fg.canAskAgain); return; }
      const bg = await Location.requestBackgroundPermissionsAsync();
      setBackground(toPerm(bg.status));
      setCanAsk(bg.canAskAgain);
    } catch {
      setBackground('denied');
    }
  }, []);

  return (
    <LocationCtx.Provider value={{ activeCount, background, canAskBackground, requestBackground }}>
      {children}
    </LocationCtx.Provider>
  );
}

export const useLocationStatus = () => useContext(LocationCtx);
