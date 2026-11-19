import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { registerPushToken } from './register';
import { routeForNotification } from './route';

/** 알림이 오면 화면들이 새로 읽도록 알리는 이벤트 이름 */
export const PUSH_RECEIVED = 'takson:push-received';

if (Platform.OS !== 'web') {
  // 앱을 보고 있을 때도 알림을 띄운다
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
    }),
  });
}

/** 로그인한 고객의 푸시 등록 + 알림을 누르면 해당 화면으로 */
export function PushSetup() {
  const { route } = useAuth();
  const home = route === 'home';

  useEffect(() => {
    if (home) void registerPushToken();
  }, [home]);

  useEffect(() => {
    if (Platform.OS === 'web' || !home) return;
    const go = (data: unknown) => {
      const to = routeForNotification(data);
      if (to) router.push(to as Href);
    };
    // 앱이 꺼져 있을 때 알림을 눌러 켠 경우
    const last = Notifications.getLastNotificationResponse();
    if (last) { go(last.notification.request.content.data); Notifications.clearLastNotificationResponse(); }
    const tap = Notifications.addNotificationResponseReceivedListener(r => go(r.notification.request.content.data));
    const got = Notifications.addNotificationReceivedListener(n => DeviceEventEmitter.emit(PUSH_RECEIVED, n.request.content.data));
    return () => { tap.remove(); got.remove(); };
  }, [home]);

  return null;
}
