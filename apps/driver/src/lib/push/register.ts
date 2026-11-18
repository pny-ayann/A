import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

const KEY = 'push-token-v1';

/** 푸시는 실제 휴대폰의 개발용/정식 앱에서만 (웹·에뮬레이터·안드로이드 Expo Go는 안 됨) */
function supported(): boolean {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  return true;
}

/** 알림 권한을 받고 이 휴대폰의 푸시 주소(토큰)를 서버에 등록한다 */
export async function registerPushToken(): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!supported()) return 'unsupported';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: '오더 알림',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    const cur = await Notifications.getPermissionsAsync();
    const granted = cur.granted || (cur.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) return 'denied';
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return 'unsupported';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return 'unsupported';
    const { error } = await supabase.from('push_tokens')
      .upsert({ user_id: s.session.user.id, token, updated_at: new Date().toISOString() });
    if (error) return 'unsupported';
    await AsyncStorage.setItem(KEY, token);
    return 'ok';
  } catch {
    return 'unsupported';
  }
}

/** 로그아웃 직전: 이 휴대폰 토큰을 지워 다른 사람이 쓸 때 앞사람 알림이 오지 않게 한다 */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(KEY);
    if (!token) return;
    await supabase.from('push_tokens').delete().eq('token', token);
    await AsyncStorage.removeItem(KEY);
  } catch {
    // 지우지 못해도 로그아웃은 계속
  }
}
