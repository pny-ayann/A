import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
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
      </AuthProvider>
    </SafeAreaProvider>
  );
}
