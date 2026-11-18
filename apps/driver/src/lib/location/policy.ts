import * as Location from 'expo-location';

/** 백그라운드 위치 작업 이름 (task.ts에서 등록) */
export const LOCATION_TASK = 'takson-driver-location';

/** 앱이 켜져 있을 때 위치를 보내는 간격 */
export const FOREGROUND_INTERVAL_MS = 30_000;

/**
 * 화면이 꺼져도 보내는 설정. 배터리를 아끼려고 1분 또는 100m마다, 정확도는 '보통'.
 * (설계 11장: 배터리 판단은 만드는 사람 몫)
 */
export const LOCATION_OPTIONS = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 60_000,
  distanceInterval: 100,
  deferredUpdatesInterval: 60_000,
};

export const FOREGROUND_SERVICE = {
  notificationTitle: '탁송 운행 중',
  notificationBody: '탁송 운행 중 위치를 보내고 있어요',
};

/** 백그라운드 위치는 로그인돼 있고, 진행 중 오더가 있고, '항상 허용'일 때만 */
export function shouldTrackInBackground(s: {
  hasSession: boolean;
  activeOrderCount: number;
  permission: 'granted' | 'denied' | 'undetermined';
}): boolean {
  return s.hasSession && s.activeOrderCount > 0 && s.permission === 'granted';
}
