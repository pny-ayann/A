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

void expectError;
