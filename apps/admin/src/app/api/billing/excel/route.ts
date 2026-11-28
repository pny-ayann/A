import { buildStatement, type BillingLine, type BillingTotal } from '@/lib/billing/excel';
import { contentDisposition, linesMatchTotal, parseMonth, statementFileName } from '@/lib/billing/month';
import { canSettle } from '@/lib/auth/gate';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';

const ZERO: BillingTotal = { supply: 0, vat: 0, fuel: 0, total: 0 };

/** 업체·달 정산서 엑셀 내려받기 (관리자). 화면과 같은 서버 계산을 쓴다. */
export async function GET(req: Request) {
  const me = await getStaffProfile();
  if (!canSettle(me?.staff_level)) return new Response('관리자·정산만 내려받을 수 있어요.', { status: 403 });
  const url = new URL(req.url);
  const company = url.searchParams.get('company') ?? '';
  const month = parseMonth(url.searchParams.get('month') ?? undefined, new Date());
  const supabase = await serverClient();
  const c = await supabase.from('companies').select('name').eq('id', company).maybeSingle();
  const name = (c.data as { name: string } | null)?.name;
  if (!name) return new Response('업체를 찾을 수 없어요.', { status: 404 });

  // 줄과 합계는 따로 불러오므로, 그 사이 오더가 고쳐져 서로 안 맞으면 다시 불러온다
  for (let i = 0; i < 3; i++) {
    const [lines, totals] = await Promise.all([
      supabase.rpc('billing_lines', { p_company: company, p_month: `${month}-01` }),
      supabase.rpc('billing_totals', { p_month: `${month}-01` }),
    ]);
    if (lines.error || totals.error) return new Response('정산서를 만들지 못했어요.', { status: 500 });
    const list = (lines.data ?? []) as BillingLine[];
    const t = ((totals.data ?? []) as (BillingTotal & { company_id: string })[]).find(x => x.company_id === company) ?? ZERO;
    if (!linesMatchTotal(list, t)) continue;
    const buf = await buildStatement(name, month, list, t);
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': contentDisposition(statementFileName(name, month), `statement_${month}.xlsx`),
        'Cache-Control': 'no-store',
      },
    });
  }
  return new Response('지금 이 달 오더가 고쳐지는 중이에요. 잠시 뒤 다시 내려받아 주세요.', { status: 409 });
}
