import { boardSince, ORDER_ROW_COLUMNS, type OrderRow } from '@/lib/orders/realtime';
import { serverClient } from '@/lib/supabase/server';
import { OrderBoard } from './OrderBoard';

export default async function OrdersPage() {
  const supabase = await serverClient();
  const [orders, companies, drivers, settings, locations] = await Promise.all([
    supabase.from('orders').select(ORDER_ROW_COLUMNS)
      .or(`status.in.(open,assigned,arrived_pickup,driving),created_at.gte.${boardSince(new Date())}`)
      .order('created_at', { ascending: false }).limit(500),
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('profiles').select('id, name, login_id').eq('role', 'driver').order('name'),
    supabase.from('settings').select('unassigned_alert_min').eq('id', 1).single(),
    supabase.from('driver_locations').select('driver_id, lat, lng, updated_at'),
  ]);
  return (
    <OrderBoard
      initialOrders={(orders.data ?? []) as OrderRow[]}
      companies={companies.data ?? []}
      drivers={(drivers.data ?? []).map(d => ({ id: d.id, name: d.name ?? d.login_id }))}
      alertMin={settings.data?.unassigned_alert_min ?? 10}
      initialLocations={locations.data ?? []}
    />
  );
}
