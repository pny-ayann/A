import { buildStatement, type BillingLine, type BillingTotal } from '@/lib/billing/excel';
import { parseMonth, statementFileName } from '@/lib/billing/month';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';

/** 업체·달 정산서 엑셀 내려받기 (관리자). 화면과 같은 서버 계산을 쓴다. */
export async function GET(req: Request) {
  const me = await getStaffProfile();
  if (me?.staff_level !== 'admin') return new Response('관리자만 내려받을 수 있어요.', { status: 403 });
  const url = new URL(req.url);
  const company = url.searchParams.get('company') ?? '';
  const month = parseMonth(url.searchParams.get('month') ?? undefined, new Date());
  const supabase = await serverClient();
  const [c, lines, totals] = await Promise.all([
    supabase.from('companies').select('name').eq('id', company).maybeSingle(),
    supabase.rpc('billing_lines', { p_company: company, p_month: `${month}-01` }),
    supabase.rpc('billing_totals', { p_month: `${month}-01` }),
  ]);
  const name = (c.data as { name: string } | null)?.name;
  if (!name) return new Response('업체를 찾을 수 없어요.', { status: 404 });
  if (lines.error || totals.error) return new Response('정산서를 만들지 못했어요.', { status: 500 });
  const t = ((totals.data ?? []) as (BillingTotal & { company_id: string })[]).find(x => x.company_id === company)
    ?? { supply: 0, vat: 0, fuel: 0, total: 0 };
  const buf = await buildStatement(name, month, (lines.data ?? []) as BillingLine[], t);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(statementFileName(name, month))}`,
      'Cache-Control': 'no-store',
    },
  });
}
