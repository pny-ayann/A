/**
 * 알림을 눌렀을 때 갈 화면 주소. 서버가 보내는 data = { orderId, screen: 'order' | 'list' | 'chat' | 'wallet' }.
 * 모양이 이상하면 null (아무 데도 안 감).
 */
export function routeForNotification(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const { screen, orderId } = data as { screen?: unknown; orderId?: unknown };
  if (screen === 'list') return '/';
  if (screen === 'wallet') return '/wallet';
  if (typeof orderId !== 'string' || !/^[\w-]+$/.test(orderId)) return null;
  if (screen === 'order') return `/order/${orderId}`;
  if (screen === 'chat') return `/order/${orderId}/chat`;
  return null;
}
