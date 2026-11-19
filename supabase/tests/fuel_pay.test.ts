import { as, createWorld, expectError, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => {
  w = await createWorld();
  await w.db.query(`update settings set settlement_start_at = '2026-01-01T00:00:00Z'`);
});

const receipt = async (order: string, amount: number) =>
  (await w.db.query<{ id: string }>(
    `insert into fuel_receipts(order_id, driver_id, amount, path) values ($1::uuid, $2, $3, $1::text || '/r.jpg') returning id`,
    [order, w.d, amount])).rows[0]!.id;
const claims = async () =>
  (await as(w.db, w.op, tx => tx.query<{ receipt_id: string; amount: number; order_no: string }>(
    'select receipt_id, amount, order_no from fuel_claims() order by created_at'))).rows;
const entries = async () =>
  (await w.db.query<{ amount: number; kind: string; label: string; withdrawable_at: Date | null }>(
    'select amount, kind, label, withdrawable_at from wallet_entries where driver_id = $1 order by created_at, id', [w.d])).rows;
const pay = (who: string, ids: string[]) =>
  as(w.db, who, tx => tx.query<{ n: number }>('select pay_fuel($1::uuid[]) as n', [ids]));
const noOf = async (o: string) => (await w.db.query<{ order_no: string }>('select order_no from orders where id = $1', [o])).rows[0]!.order_no;
const summary = async () =>
  (await as(w.db, w.d, tx => tx.query<{ balance: number; withdrawable: number }>('select balance, withdrawable from wallet_summary($1)', [w.d]))).rows[0]!;

test('후불 오더 영수증은 청구 목록에, 현금 오더 영수증은 없다 (기본 설정)', async () => {
  const post = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, payment_method: 'postpaid' });
  const cash = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, payment_method: 'cash' });
  const r1 = await receipt(post, 10000);
  await receipt(cash, 20000);
  expect(await claims()).toEqual([{ receipt_id: r1, amount: 10000, order_no: await noOf(post) }]);
});

test('업체 설정을 바꾸면 현금 오더도 상황실 지급', async () => {
  await w.db.query(`update companies set fuel_payer_cash = 'office' where id = $1`, [w.A]);
  const cash = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, payment_method: 'cash' });
  await receipt(cash, 20000);
  expect((await claims()).map(c => c.amount)).toEqual([20000]);
});

test('건별 지급: 기사 충전금에 즉시 들어오고 즉시 출금 가능', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, payment_method: 'postpaid' });
  const r = await receipt(o, 10000);
  expect((await pay(w.op, [r])).rows[0]!.n).toBe(1);
  expect(await entries()).toEqual([{ amount: 10000, kind: 'fuel', label: `주유비 지급 (${await noOf(o)})`, withdrawable_at: null }]);
  expect(await summary()).toEqual({ balance: 10000, withdrawable: 10000 });
  expect(await claims()).toEqual([]);
});

test('여러 건 한 번에 지급, 이미 지급한 건은 건너뛴다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, payment_method: 'postpaid' });
  const r1 = await receipt(o, 10000);
  const r2 = await receipt(o, 5000);
  await pay(w.op, [r1]);
  expect((await pay(w.op, [r1, r2])).rows[0]!.n).toBe(1);
  expect((await entries()).map(e => e.amount)).toEqual([10000, 5000]);
});

test('현금 오더(업체 지급) 영수증은 지급 대상이 아니라 건너뛴다', async () => {
  const cash = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, payment_method: 'cash' });
  const r = await receipt(cash, 20000);
  expect((await pay(w.op, [r])).rows[0]!.n).toBe(0);
  expect(await entries()).toEqual([]);
});

test('지급한 영수증을 고치면 차이만 적힌다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, payment_method: 'postpaid' });
  const r = await receipt(o, 10000);
  await pay(w.op, [r]);
  await as(w.db, w.op, tx => tx.query('update fuel_receipts set amount = 12000 where id = $1', [r]));
  await as(w.db, w.op, tx => tx.query('delete from fuel_receipts where id = $1', [r]));
  const no = await noOf(o);
  expect(await entries()).toEqual([
    { amount: 10000, kind: 'fuel', label: `주유비 지급 (${no})`, withdrawable_at: null },
    { amount: 2000, kind: 'fuel_adjust', label: `주유비 변경 (${no})`, withdrawable_at: null },
    { amount: -12000, kind: 'fuel_adjust', label: `주유비 변경 (${no})`, withdrawable_at: null },
  ]);
});

test('일반 관제도 지급할 수 있고, 기사·고객은 못 한다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, payment_method: 'postpaid' });
  const r = await receipt(o, 10000);
  await expectError(pay(w.d, [r]), 'FORBIDDEN');
  await expectError(pay(w.a, [r]), 'FORBIDDEN');
  await expectError(as(w.db, w.d, tx => tx.query('select * from fuel_claims()')), 'FORBIDDEN');
  expect((await pay(w.op, [r])).rows[0]!.n).toBe(1);
});
