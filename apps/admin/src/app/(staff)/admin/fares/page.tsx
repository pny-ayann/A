import { serverClient } from '@/lib/supabase/server';
import { FareBandEditor } from './FareBandEditor';
import { MissionAddForm, MissionRow } from './MissionForms';

export default async function FaresPage() {
  const supabase = await serverClient();
  const [bands, missions] = await Promise.all([
    supabase.from('fare_bands').select('max_km, fare').order('max_km'),
    supabase.from('missions').select('id, name, extra_fare, active').order('created_at'),
  ]);
  return (
    <div className="max-w-3xl space-y-10">
      <section>
        <h1 className="mb-1 text-xl font-bold">거리별 기본 요금</h1>
        <p className="mb-4 text-sm text-slate-600">
          거리가 &quot;최대 거리&quot; 이하이면 그 요금이 붙어요. 가장 먼 구간보다 멀면 가장 먼 구간 요금이 붙어요. 접수 때 요금은 직접 고칠 수 있어요.
        </p>
        <FareBandEditor initial={(bands.data ?? []).map(b => ({ max_km: Number(b.max_km), fare: b.fare }))} />
      </section>
      <section>
        <h2 className="mb-1 text-xl font-bold">미션</h2>
        <p className="mb-4 text-sm text-slate-600">세차·주유대행처럼 오더에 붙는 추가 일이에요. 끄면 새 오더에서 고를 수 없어요.</p>
        <div className="space-y-2">
          {(missions.data ?? []).map(m => <MissionRow key={m.id} mission={m} />)}
          {missions.data?.length === 0 && <p className="text-sm text-slate-500">아직 미션이 없어요.</p>}
        </div>
        <MissionAddForm />
      </section>
    </div>
  );
}
