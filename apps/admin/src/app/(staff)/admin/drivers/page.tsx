import Link from 'next/link';
import { AccountFields, ActionForm, inputCls } from '@/components/ActionForm';
import { issueAccount, setCommission, setDriverStatus } from '@/lib/accounts/actions';
import { canSettle } from '@/lib/auth/gate';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';
import { won } from '@/lib/wallet/format';

const STATUS_LABEL: Record<string, string> = { pending: '대기', active: '승인', suspended: '정지' };
const FILTERS = [
  { key: '', label: '전체' },
  { key: 'pending', label: '대기' },
  { key: 'active', label: '승인' },
  { key: 'suspended', label: '정지' },
];

/** 관리자·정산은 승인·정지·수수료·발급까지. 일반 관제는 보기만 한다 (설계 8.5, 수수료는 안 보임). 충전금 잔액은 모두 본다 */
export default async function DriversPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = '' } = await searchParams;
  const isAdmin = canSettle((await getStaffProfile())?.staff_level);
  const supabase = await serverClient();
  let q = supabase.from('profiles').select('id, login_id, name, phone, driver_status, created_at').eq('role', 'driver');
  if (STATUS_LABEL[status]) q = q.eq('driver_status', status);
  const [drivers, rates, releases] = await Promise.all([
    q.order('created_at', { ascending: false }),
    isAdmin ? supabase.from('driver_rates').select('driver_id, commission_rate') : Promise.resolve({ data: [] as { driver_id: string; commission_rate: number }[] }),
    supabase.from('order_events').select('actor_id').eq('type', 'released'),
  ]);

  const rateOf = new Map((rates.data ?? []).map(r => [r.driver_id, Number(r.commission_rate)]));
  const releaseCount = new Map<string, number>();
  for (const e of releases.data ?? []) {
    if (e.actor_id) releaseCount.set(e.actor_id, (releaseCount.get(e.actor_id) ?? 0) + 1);
  }
  // 충전금 잔액 (못 불러오면 null → '—'. 0원으로 보이면 잘못 판단할 수 있어서)
  const balances = await Promise.all((drivers.data ?? []).map(async d => {
    const { data, error } = await supabase.rpc('wallet_summary', { p_driver: d.id });
    return error ? null : (((data ?? []) as { balance: number }[])[0]?.balance ?? 0);
  }));

  return (
    <div className="max-w-6xl space-y-8">
      <section>
        <h1 className="mb-3 text-xl font-bold">{isAdmin ? '기사 관리' : '기사 조회'}</h1>
        <div className="mb-4 flex gap-2 text-sm">
          {FILTERS.map(f => (
            <Link key={f.key} href={f.key ? `/admin/drivers?status=${f.key}` : '/admin/drivers'}
              className={`rounded border px-3 py-1 ${status === f.key ? 'bg-ink text-white' : 'hover:bg-slate-50'}`}>
              {f.label}
            </Link>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-600">
              <th className="py-2">이름</th><th>아이디·전화</th><th>상태</th><th className="pr-4 text-right">충전금</th><th>반납</th>{isAdmin && <th>수수료율</th>}
            </tr>
          </thead>
          <tbody>
            {(drivers.data ?? []).map((d, i) => (
              <tr key={d.id} className="border-b align-top">
                <td className="py-2 font-semibold">{d.name}</td>
                <td><div className="text-slate-500">{d.login_id}</div><div>{d.phone}</div></td>
                <td>
                  <div className="mb-1">{STATUS_LABEL[d.driver_status ?? ''] ?? d.driver_status}</div>
                  {isAdmin && <div className="flex gap-1">
                    {d.driver_status !== 'active' && (
                      <ActionForm action={setDriverStatus} submit="승인">
                        <input type="hidden" name="id" value={d.id} /><input type="hidden" name="status" value="active" />
                      </ActionForm>
                    )}
                    {d.driver_status !== 'suspended' && (
                      <ActionForm action={setDriverStatus} submit="정지">
                        <input type="hidden" name="id" value={d.id} /><input type="hidden" name="status" value="suspended" />
                      </ActionForm>
                    )}
                  </div>}
                </td>
                <td className={`pr-4 text-right font-semibold ${(balances[i] ?? 0) < 0 ? 'text-red-600' : ''}`}>
                  {balances[i] === null ? '—' : isAdmin
                    ? <Link href={`/admin/wallets/${d.id}`} className="hover:underline">{won(balances[i]!)}</Link>
                    : won(balances[i]!)}
                </td>
                <td>{releaseCount.get(d.id) ?? 0}회</td>
                {isAdmin && <td>
                  <ActionForm action={setCommission} submit="저장">
                    <input type="hidden" name="id" value={d.id} />
                    <input name="rate" inputMode="decimal" aria-label="수수료율" defaultValue={rateOf.get(d.id) ?? ''}
                      placeholder="미정" className={`${inputCls} w-16`} />
                    <span>%</span>
                  </ActionForm>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
        {drivers.data?.length === 0 && <p className="mt-3 text-sm text-slate-500">해당하는 기사가 없어요.</p>}
      </section>
      {isAdmin && <section className="border-t pt-6">
        <h2 className="mb-1 text-lg font-bold">기사 계정 발급</h2>
        <p className="mb-3 text-sm text-slate-600">여기서 만든 기사는 바로 승인 상태예요.</p>
        <ActionForm action={issueAccount} submit="발급" primary>
          <input type="hidden" name="role" value="driver" />
          <AccountFields />
        </ActionForm>
      </section>}
    </div>
  );
}
