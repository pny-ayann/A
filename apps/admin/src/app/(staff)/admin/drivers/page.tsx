import Link from 'next/link';
import { AccountFields, ActionForm, inputCls } from '@/components/ActionForm';
import { issueAccount, setCommission, setDriverStatus } from '@/lib/accounts/actions';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';

const STATUS_LABEL: Record<string, string> = { pending: '대기', active: '승인', suspended: '정지' };
const DOC_LABEL: Record<string, string> = { license: '면허증', insurance: '보험' };
const FILTERS = [
  { key: '', label: '전체' },
  { key: 'pending', label: '대기' },
  { key: 'active', label: '승인' },
  { key: 'suspended', label: '정지' },
];

/** 관리자는 승인·정지·수수료·발급까지. 일반 관제는 보기만 한다 (설계 8.5, 수수료는 안 보임) */
export default async function DriversPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = '' } = await searchParams;
  const isAdmin = (await getStaffProfile())?.staff_level === 'admin';
  const supabase = await serverClient();
  let q = supabase.from('profiles').select('id, login_id, name, phone, driver_status, created_at').eq('role', 'driver');
  if (STATUS_LABEL[status]) q = q.eq('driver_status', status);
  const [drivers, rates, docs, releases] = await Promise.all([
    q.order('created_at', { ascending: false }),
    isAdmin ? supabase.from('driver_rates').select('driver_id, commission_rate') : Promise.resolve({ data: [] as { driver_id: string; commission_rate: number }[] }),
    supabase.from('driver_documents').select('driver_id, kind, path'),
    supabase.from('order_events').select('actor_id').eq('type', 'released'),
  ]);

  const rateOf = new Map((rates.data ?? []).map(r => [r.driver_id, Number(r.commission_rate)]));
  const releaseCount = new Map<string, number>();
  for (const e of releases.data ?? []) {
    if (e.actor_id) releaseCount.set(e.actor_id, (releaseCount.get(e.actor_id) ?? 0) + 1);
  }
  const docRows = docs.data ?? [];
  const signed = docRows.length
    ? (await supabase.storage.from('driver-docs').createSignedUrls(docRows.map(d => d.path), 600)).data ?? []
    : [];
  const docsOf = new Map<string, { kind: string; url: string }[]>();
  docRows.forEach((d, i) => {
    const url = signed[i]?.signedUrl;
    if (url) docsOf.set(d.driver_id, [...(docsOf.get(d.driver_id) ?? []), { kind: d.kind, url }]);
  });

  return (
    <div className="max-w-6xl space-y-8">
      <section>
        <h1 className="mb-3 text-xl font-bold">{isAdmin ? '기사 관리' : '기사 조회'}</h1>
        <div className="mb-4 flex gap-2 text-sm">
          {FILTERS.map(f => (
            <Link key={f.key} href={f.key ? `/admin/drivers?status=${f.key}` : '/admin/drivers'}
              className={`rounded border px-3 py-1 ${status === f.key ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}>
              {f.label}
            </Link>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-600">
              <th className="py-2">이름</th><th>아이디·전화</th><th>상태</th><th>서류</th><th>반납</th>{isAdmin && <th>수수료율</th>}
            </tr>
          </thead>
          <tbody>
            {(drivers.data ?? []).map(d => (
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
                <td>
                  {(docsOf.get(d.id) ?? []).map(doc => (
                    <a key={doc.kind} href={doc.url} target="_blank" rel="noreferrer" className="mr-2 text-blue-600 underline">
                      {DOC_LABEL[doc.kind] ?? doc.kind}
                    </a>
                  ))}
                  {!docsOf.has(d.id) && <span className="text-slate-400">없음</span>}
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
