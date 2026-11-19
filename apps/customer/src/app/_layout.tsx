import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { PushSetup } from '@/lib/push/PushSetup';
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
      </Stack.Protected>
      <Stack.Protected guard={route === 'not-customer'}>
        <Stack.Screen name="not-customer" />
      </Stack.Protected>
      <Stack.Protected guard={route === 'retry'}>
        <Stack.Screen name="retry" />
      </Stack.Protected>
      <Stack.Protected guard={route === 'home'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="order/[id]/index" options={{ headerShown: true, title: '오더' }} />
        <Stack.Screen name="order/[id]/edit" options={{ headerShown: true, title: '오더 수정' }} />
        <Stack.Screen name="order/[id]/amend" options={{ headerShown: true, title: '변경 요청' }} />
        <Stack.Screen name="order/[id]/chat" options={{ headerShown: true, title: '관제 문의' }} />
        <Stack.Screen name="order/[id]/photos" options={{ headerShown: true, title: '사진·주유비' }} />
        <Stack.Screen name="address-search" options={{ headerShown: true, title: '주소 검색', presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Gate />
        <PushSetup />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
