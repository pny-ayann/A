import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { LocationReporter } from '@/lib/location/LocationReporter';
import '@/lib/location/task'; // 화면 꺼짐 위치 작업 등록 (앱 시작 때 꼭 한 번)
import { PushSetup } from '@/lib/push/PushSetup';
import { PhotoQueueProvider } from '@/lib/photos/PhotoQueueProvider';
import { color } from '@/ui/kit';

function Gate() {
  const { ready, route } = useAuth();
  if (!ready) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg }}><ActivityIndicator size="large" /></View>;
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={route === 'login'}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
      </Stack.Protected>
      <Stack.Protected guard={route === 'pending' || route === 'suspended'}>
        <Stack.Screen name="pending" />
      </Stack.Protected>
      <Stack.Protected guard={route === 'home'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="order/[id]/index" options={{ headerShown: true, title: '오더' }} />
        <Stack.Screen name="order/[id]/camera" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="order/[id]/chat" options={{ headerShown: true, title: '관제 문의' }} />
        <Stack.Screen name="order/[id]/fuel" options={{ headerShown: true, title: '주유 등록' }} />
        <Stack.Screen name="wallet/withdraw" options={{ headerShown: true, title: '출금 신청' }} />
        <Stack.Screen name="wallet/account" options={{ headerShown: true, title: '받을 계좌' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <PhotoQueueProvider>
          <LocationReporter>
            <Gate />
            <PushSetup />
          </LocationReporter>
        </PhotoQueueProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
