import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { supabase } from '../supabase';
import { LOCATION_TASK } from './policy';

/**
 * 화면이 꺼져도 도는 위치 작업. 앱 진입 파일(_layout)에서 import 해야 등록된다.
 * 한 번에 여러 위치가 오면 마지막 것만 보낸다. 로그인이 풀렸으면 작업을 멈춘다.
 */
if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
      return;
    }
    const last = data.locations[data.locations.length - 1];
    await supabase.rpc('report_location', { p_lat: last.coords.latitude, p_lng: last.coords.longitude });
  });
}
