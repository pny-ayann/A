import Link from 'next/link';
import { ACTION_LABEL, AUDIT_PAGE_SIZE, auditPageRange, diffRows, formatValue, TABLE_LABEL } from '@/lib/admin/audit';
import { serverClient } from '@/lib/supabase/server';

type AuditRow = {
  id: string; actor_id: string | null; table_name: string; row_id: string | null; action: string;
  old_row: Record<string, unknown> | null; new_row: Record<string, unknown> | null; created_at: string;
};
type Search = { table?: string; actor?: string; date?: string; page?: string };

const input = 'rounded border px-2 py-1 text-sm';
const kst = (iso: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(new Date(iso));
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

function Changes({ row, nameOf }: { row: AuditRow; nameOf: Map<string, string> }) {
  // 사람 id(기사·작성자 등)는 이름으로 보여 준다
  const show = (v: unknown) => short(typeof v === 'string' && nameOf.has(v) ? nameOf.get(v)! : formatValue(v));
  const changes = diffRows(row.old_row, row.new_row);
  if (row.action === 'UPDATE') {
    if (!changes.length) return <span className="text-slate-400">바뀐 칸 없음</span>;
    return (
      <ul className="space-y-0.5">
        {changes.map(c => (
          <li key={c.field}>
            <span className="font-mono text-xs text-slate-500">{c.field}</span>{' '}
            {show(c.from)} → <b>{show(c.to)}</b>
          </li>
        ))}
      </ul>
    );
  }
  // 추가·삭제는 칸이 많아서 접어 둔다
  return (
    <details>
      <summary className="cursor-pointer text-slate-600">{row.action === 'INSERT' ? '새 값' : '지운 값'} {changes.length}칸 보기</summary>
      <ul className="mt-1 space-y-0.5">
        {changes.map(c => (
          <li key={c.field}><span className="font-mono text-xs text-slate-500">{c.field}</span> {show(row.action === 'INSERT' ? c.to : c.from)}</li>
        ))}
      </ul>
    </details>
  );
}

/** 관리자 전용 변경 기록 (접근은 미들웨어가 관리자만 허용, 읽기는 RLS가 관리자만 허용) */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [from, to] = auditPageRange(page);
  const supabase = await serverClient();

  let q = supabase.from('audit_log')
    .select('id, actor_id, table_name, row_id, action, old_row, new_row, created_at', { count: 'exact' })
    .order('created_at', { ascending: false }).range(from, to);
  if (sp.table) q = q.eq('table_name', sp.table);
  if (sp.actor) q = q.eq('actor_id', sp.actor);
  if (sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)) {
    // 한국 날짜 하루 = 전날 15:00Z ~ 그날 15:00Z
    const start = new Date(`${sp.date}T00:00:00+09:00`);
    q = q.gte('created_at', start.toISOString()).lt('created_at', new Date(start.getTime() + 24 * 3600_000).toISOString());
  }
  const [{ data, count, error }, people] = await Promise.all([
    q,
    supabase.from('profiles').select('id, name, login_id, role').order('name'),
  ]);
  const rows = (data ?? []) as AuditRow[];
  const nameOf = new Map((people.data ?? []).map(p => [p.id as string, (p.name ?? p.login_id) as string]));
  const staff = (people.data ?? []).filter(p => p.role === 'staff');
  const lastPage = Math.max(1, Math.ceil((count ?? 0) / AUDIT_PAGE_SIZE));
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (sp.table) params.set('table', sp.table);
    if (sp.actor) params.set('actor', sp.actor);
    if (sp.date) params.set('date', sp.date);
    params.set('page', String(p));
    return `/admin/audit?${params}`;
  };

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">변경 기록</h1>
      <p className="text-sm text-slate-500">오더·업체·계정·설정·요금표·미션이 바뀔 때마다 서버가 자동으로 남긴 기록이에요. 지우거나 고칠 수 없어요.</p>

      <form className="flex flex-wrap items-center gap-2 text-sm">
        <select name="table" defaultValue={sp.table ?? ''} aria-label="표 필터" className={input}>
          <option value="">모든 표</option>
          {Object.entries(TABLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="actor" defaultValue={sp.actor ?? ''} aria-label="사람 필터" className={input}>
          <option value="">모든 사람</option>
          {staff.map(p => <option key={p.id} value={p.id}>{p.name ?? p.login_id}</option>)}
        </select>
        <input type="date" name="date" defaultValue={sp.date ?? ''} aria-label="날짜 필터" className={input} />
        <button className="rounded border px-3 py-1 hover:bg-slate-50">찾기</button>
        {(sp.table || sp.actor || sp.date) && <Link href="/admin/audit" className="text-slate-500 underline">필터 지우기</Link>}
      </form>

      {error ? (
        <p role="alert" className="text-sm text-red-600">기록을 불러오지 못했어요.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">조건에 맞는 기록이 없어요.</p>
      ) : (
        <table className="w-full rounded border bg-white text-sm">
          <thead className="bg-slate-100 text-left text-xs text-slate-600">
            <tr><th className="px-2 py-1.5">시각</th><th className="px-2">누가</th><th className="px-2">무엇을</th><th className="px-2">바뀐 내용</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-2 py-1.5 whitespace-nowrap">{kst(r.created_at)}</td>
                <td className="px-2 whitespace-nowrap">{r.actor_id ? nameOf.get(r.actor_id) ?? '알 수 없음' : '시스템'}</td>
                <td className="px-2 whitespace-nowrap">
                  {TABLE_LABEL[r.table_name] ?? r.table_name} {ACTION_LABEL[r.action] ?? r.action}
                  {r.table_name === 'orders' && r.row_id && (
                    <Link href={`/orders/${r.row_id}`} className="ml-1 text-xs text-blue-600 hover:underline">오더 보기</Link>
                  )}
                </td>
                <td className="px-2 py-1.5"><Changes row={r} nameOf={nameOf} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center gap-3 text-sm">
        {page > 1 && <Link href={link(page - 1)} className="underline">← 이전</Link>}
        <span className="text-slate-500">{page} / {lastPage} 페이지 · 모두 {count ?? 0}개</span>
        {page < lastPage && <Link href={link(page + 1)} className="underline">다음 →</Link>}
      </div>
    </div>
  );
}
