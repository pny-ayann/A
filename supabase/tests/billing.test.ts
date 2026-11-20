import { as, createWorld, expectError, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

type Line = { order_no: string; fare: number; fuel: number; missions: string; pickup_area: string; vehicle_number: string };
type Total = { company_id: string; company_name: string; supply: number; vat: number; fuel: number; total: number };

const lines = async (c: string, m: string) =>
  (await as(w.db, w.admin, tx => tx.query<Line>('select * from billing_lines($1::uuid, $2::date)', [c, m]))).rows;
const totals = async (m: string) =>
  (await as(w.db, w.admin, tx => tx.query<Total>('select * from billing_totals($1::date)', [m]))).rows;
const done = (c: string, fare: number, at = '2026-11-10T03:00:00Z', o: Record<string, unknown> = {}) =>
  seedOrder(w.db, c, { status: 'completed', completed_at: at, payment_method: 'postpaid', fare, ...o });
const receipt = (order: string, amount: number) =>
  w.db.query(`insert into fuel_receipts(order_id, driver_id, amount, path) values ($1::uuid, $2, $3, $1::text || '/r.jpg')`,
    [order, w.d, amount]);

test('후불 완료 오더만 들어가고 현금·취소·진행 중은 빠진다', async () => {
  await done(w.A, 300000);
  await done(w.A, 50000, undefined, { payment_method: 'cash' });
  await seedOrder(w.db, w.A, { status: 'cancelled', payment_method: 'postpaid' });
  await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, payment_method: 'postpaid' });
  expect((await lines(w.A, '2026-11-01')).map(l => l.fare)).toEqual([300000]);
});

test('한국 시간 달 경계로 나눈다', async () => {
  await done(w.A, 1000, '2026-11-30T14:59:00Z');
  await done(w.A, 2000, '2026-11-30T15:00:00Z');
  expect((await lines(w.A, '2026-11-01')).map(l => l.fare)).toEqual([1000]);
  expect((await lines(w.A, '2026-12-15')).map(l => l.fare)).toEqual([2000]);
});

test('완료를 되돌린 오더는 빠진다', async () => {
  const o = await done(w.A, 300000);
  await w.db.query(`update orders set status = 'driving', driver_id = $2 where id = $1`, [o, w.d]);
  expect(await lines(w.A, '2026-11-01')).toEqual([]);
});

test('부가세는 합계에 한 번, 원 미만 버림', async () => {
  await done(w.A, 12345);
  await done(w.A, 10001);
  expect(await totals('2026-11-01')).toEqual([
    { company_id: w.A, company_name: '상사A', supply: 22346, vat: 2234, fuel: 0, total: 24580 },
  ]);
});

test('주유비: 고객 청구 + 상황실 지급일 때만 실비로 더한다', async () => {
  const o = await done(w.A, 100000);
  await receipt(o, 30000);
  await receipt(o, 20000);
  expect((await lines(w.A, '2026-11-01'))[0]!.fuel).toBe(50000);
  expect((await totals('2026-11-01'))[0]).toMatchObject({ supply: 100000, vat: 10000, fuel: 50000, total: 160000 });
  await w.db.query(`update companies set fuel_payer_postpaid = 'company' where id = $1`, [w.A]);
  expect((await lines(w.A, '2026-11-01'))[0]!.fuel).toBe(0);
  await w.db.query(`update companies set fuel_payer_postpaid = 'office', fuel_billing = 'company' where id = $1`, [w.A]);
  expect((await totals('2026-11-01'))[0]).toMatchObject({ fuel: 0, total: 110000 });
});

test('요금 0원이고 청구 주유비도 0원인 오더는 빠진다', async () => {
  await done(w.A, 0);
  expect(await lines(w.A, '2026-11-01')).toEqual([]);
  const o = await done(w.A, 0);
  await receipt(o, 10000);
  expect((await lines(w.A, '2026-11-01')).map(l => [l.fare, l.fuel])).toEqual([[0, 10000]]);
});

test('미션 이름을 이어 붙인다', async () => {
  const o = await done(w.A, 70000);
  for (const name of ['주차', '세차']) {
    await w.db.query(
      `with m as (insert into missions(name, extra_fare) values ($2, 10000) returning id)
       insert into order_missions(order_id, mission_id, extra_fare) select $1, id, 10000 from m`, [o, name]);
  }
  const [l] = await lines(w.A, '2026-11-01');
  expect(l).toMatchObject({ missions: '세차, 주차', pickup_area: '중구 태평로1가', vehicle_number: '12가3456' });
});

test('totals는 업체별로 나뉘고 줄 합과 같다', async () => {
  await done(w.A, 100000);
  await done(w.A, 200000);
  await done(w.B, 150000);
  const t = await totals('2026-11-01');
  expect(t.map(x => [x.company_name, x.supply, x.total])).toEqual([['상사A', 300000, 330000], ['상사B', 150000, 165000]]);
  expect(await totals('2026-10-01')).toEqual([]);
});

// ---- 입금 체크와 미수금 ----------------------------------------------------------
type Sum = { company_id: string; total: number; paid_amount: number | null; paid_at: Date | null };
type Due = { company_id: string; company_name: string; month: string; total: number; paid_amount: number | null; due: number };

const summary = async (m: string) =>
  (await as(w.db, w.admin, tx => tx.query<Sum>('select * from billing_summary($1::date)', [m]))).rows;
const receivables = async () =>
  (await as(w.db, w.admin, tx => tx.query<Due>(
    'select company_id, company_name, month::text, total, paid_amount, due from billing_receivables()'))).rows;
const totalOf = async (c: string, m: string) => (await totals(m)).find(t => t.company_id === c)?.total ?? 0;
/** expected = 관리자가 화면에서 본 청구금액 (안 주면 지금 금액) */
const setPaid = async (c: string, m: string, paid: boolean, who = w.admin, expected?: number) => {
  const e = expected ?? (who === w.admin ? await totalOf(c, m) : 0);
  return as(w.db, who, tx => tx.query('select set_company_paid($1::uuid, $2::date, $3, $4)', [c, m, paid, e]));
};
/** 지금(한국 시간)보다 2달 전 달의 1일과, 그 달 안의 완료 시각 */
const twoMonthsAgo = async () => (await w.db.query<{ m: string; at: string }>(
  `select to_char(d, 'YYYY-MM-DD') as m, ((d + interval '4 day 12 hour')::timestamp at time zone 'Asia/Seoul')::text as at
   from (select date_trunc('month', now() at time zone 'Asia/Seoul') - interval '2 month' as d) x`)).rows[0]!;

test('체크하면 그때 청구금액이 저장되고 summary에 보인다', async () => {
  await done(w.A, 300000);
  await setPaid(w.A, '2026-11-15', true);
  const [s] = await summary('2026-11-01');
  expect(s).toMatchObject({ company_id: w.A, total: 330000, paid_amount: 330000 });
  expect(s!.paid_at).not.toBeNull();
});

test('체크 해제하면 줄이 지워지고 변경 기록에 남는다', async () => {
  await done(w.A, 300000);
  await setPaid(w.A, '2026-11-01', true);
  await setPaid(w.A, '2026-11-01', false);
  expect((await w.db.query('select 1 from company_payments')).rows).toEqual([]);
  expect((await w.db.query<{ action: string }>(
    `select action from audit_log where table_name = 'company_payments' order by created_at, action desc`)).rows.map(r => r.action))
    .toEqual(['INSERT', 'DELETE']);
  expect((await summary('2026-11-01'))[0]).toMatchObject({ total: 330000, paid_amount: null });
});

test('다시 체크하면 새 금액으로 바뀐다', async () => {
  await done(w.A, 300000);
  await setPaid(w.A, '2026-11-01', true);
  await done(w.A, 100000);
  expect((await summary('2026-11-01'))[0]).toMatchObject({ total: 440000, paid_amount: 330000 });
  await setPaid(w.A, '2026-11-01', true);
  expect((await summary('2026-11-01'))[0]).toMatchObject({ total: 440000, paid_amount: 440000 });
});

test('체크 뒤 늘어난 차액만 미수금', async () => {
  const { m, at } = await twoMonthsAgo();
  await done(w.A, 300000, at);
  await setPaid(w.A, m, true);
  expect(await receivables()).toEqual([]);
  await done(w.A, 100000, at);
  expect(await receivables()).toEqual([
    { company_id: w.A, company_name: '상사A', month: m, total: 440000, paid_amount: 330000, due: 110000 },
  ]);
});

test('체크 뒤 줄면 미수금이 아니다', async () => {
  const { m, at } = await twoMonthsAgo();
  const o = await done(w.A, 300000, at);
  await setPaid(w.A, m, true);
  await w.db.query(`update orders set status = 'cancelled' where id = $1`, [o]);
  expect(await receivables()).toEqual([]);
  expect(await summary(m)).toEqual([
    expect.objectContaining({ company_id: w.A, total: 0, paid_amount: 330000 }),
  ]);
});

test('미입금은 청구금액 전부, 이번 달은 미수금에 안 들어간다', async () => {
  const { m, at } = await twoMonthsAgo();
  await done(w.B, 150000, at);
  await done(w.A, 300000, new Date().toISOString());
  expect(await receivables()).toEqual([
    { company_id: w.B, company_name: '상사B', month: m, total: 165000, paid_amount: null, due: 165000 },
  ]);
});

test('관리자가 아니면 정산 함수와 입금 표를 못 쓴다', async () => {
  await done(w.A, 300000);
  await setPaid(w.A, '2026-11-01', true);
  for (const who of [w.op, w.d, w.a]) {
    await expectError(as(w.db, who, tx => tx.query(`select * from billing_lines($1::uuid, '2026-11-01')`, [w.A])), 'FORBIDDEN');
    await expectError(as(w.db, who, tx => tx.query(`select * from billing_totals('2026-11-01')`)), 'FORBIDDEN');
    await expectError(as(w.db, who, tx => tx.query(`select * from billing_summary('2026-11-01')`)), 'FORBIDDEN');
    await expectError(as(w.db, who, tx => tx.query('select * from billing_receivables()')), 'FORBIDDEN');
    await expectError(setPaid(w.A, '2026-11-01', false, who), 'FORBIDDEN');
    expect((await as(w.db, who, tx => tx.query('select * from company_payments'))).rows).toEqual([]);
  }
  await expectError(as(w.db, w.op, tx => tx.query(
    `insert into company_payments(company_id, month, amount) values ($1, '2026-12-01', 1)`, [w.A])), 'row-level security');
});

// ---- 검토 뒤 고침 ----------------------------------------------------------------
test('화면에서 본 금액과 지금 금액이 다르면 체크하지 않는다', async () => {
  const o = await done(w.A, 300000);
  await receipt(o, 50000); // 관리자가 330,000을 본 뒤 주유비가 들어옴
  await expectError(setPaid(w.A, '2026-11-01', true, w.admin, 330000), 'AMOUNT_CHANGED');
  expect((await w.db.query('select 1 from company_payments')).rows).toEqual([]);
  await setPaid(w.A, '2026-11-01', false, w.admin, 999); // 해제는 금액을 보지 않는다
});

test('한 달 공급가액이 2.15억을 넘어도 계산된다', async () => {
  await done(w.A, 220000000);
  expect((await totals('2026-11-01'))[0]).toMatchObject({ supply: 220000000, vat: 22000000, total: 242000000 });
});

test('정산 계산에 필요한 색인이 있다', async () => {
  const idx = (await w.db.query<{ indexdef: string }>(
    `select indexdef from pg_indexes where tablename in ('fuel_receipts', 'orders')`)).rows.map(r => r.indexdef).join('\n');
  expect(idx).toMatch(/ON public\.fuel_receipts USING btree \(order_id\)/);
  expect(idx).toMatch(/ON public\.orders USING btree \(completed_at\) WHERE/);
});

test('내부 계산 함수는 로그인한 사용자가 직접 부를 수 없다', async () => {
  await expectError(as(w.db, w.admin, tx => tx.query(`select * from billing_lines_all('2026-11-01')`)), 'permission denied');
});
