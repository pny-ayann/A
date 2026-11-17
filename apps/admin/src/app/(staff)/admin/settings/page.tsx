import { serverClient } from '@/lib/supabase/server';
import { SettingsForm } from './SettingsForm';

export default async function SettingsPage() {
  const supabase = await serverClient();
  const { data } = await supabase.from('settings')
    .select('release_min_takson, release_min_daeri, reservation_gap_min, unassigned_alert_min').eq('id', 1).single();
  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-xl font-bold">운영 설정</h1>
      <p className="mb-6 text-sm text-slate-600">모든 값은 분 단위예요. 1분에서 240분 사이로 넣어 주세요.</p>
      {data ? <SettingsForm initial={data} /> : <p className="text-red-600">설정을 불러오지 못했어요.</p>}
    </div>
  );
}
