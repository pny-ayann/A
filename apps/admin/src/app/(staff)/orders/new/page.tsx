import { serverClient } from '@/lib/supabase/server';
import { OrderNewForm } from './OrderNewForm';

export default async function NewOrderPage() {
  const supabase = await serverClient();
  const [companies, bands, missions] = await Promise.all([
    supabase.from('companies').select('id, name, default_payment').order('name'),
    supabase.from('fare_bands').select('max_km, fare').order('max_km'),
    supabase.from('missions').select('id, name, extra_fare').eq('active', true).order('created_at'),
  ]);
  return (
    <div className="max-w-4xl">
      <h1 className="mb-4 text-xl font-bold">오더 접수</h1>
      <OrderNewForm
        companies={companies.data ?? []}
        bands={(bands.data ?? []).map(b => ({ max_km: Number(b.max_km), fare: b.fare }))}
        missions={missions.data ?? []}
      />
    </div>
  );
}
