import { as, createWorld, expectError, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => {
  w = await createWorld();
  await w.db.query(`update settings set settlement_start_at = '2026-01-01T00:00:00Z'`);
});

type Entry = { driver_id: string; amount: number; kind: string; label: string; rate: string | null; effective_at: Date; withdrawable_at: Date | null };
const entries = async (driver?: string) =>
  (await w.db.query<Entry>(
    `select driver_id, amount, kind, label, rate, effective_at, withdrawable_at from wallet_entries ${driver ? 'where driver_id = $1' : ''} order by created_at, id`,
    driver ? [driver] : [])).rows;
const sum = async (driver: string) => (await entries(driver)).reduce((s, e) => s + e.amount, 0);
const summary = async (driver: string, at: string) =>
  (await as(w.db, driver, tx => tx.query<{ balance: number; withdrawable: number; pending: number }>(
    'select balance, withdrawable, pending from wallet_summary($1, $2)', [driver, at]))).rows[0];
const complete = (o: string, at: string) =>
  w.db.query(`update orders set status = 'completed', completed_at = $2 where id = $1`, [o, at]);
const noOf = async (o: string) => (await w.db.query<{ order_no: string }>('select order_no from orders where id = $1', [o])).rows[0]!.order_no;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

test('후불 완료: +80%, 10분 뒤 들어오고 다음 날 12시(한국)부터 출금', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 30000, payment_method: 'postpaid' });
  await complete(o, '2026-11-19T21:00:00+09:00');
  const e = await entries(w.d);
  expect(e).toHaveLength(1);
  expect(e[0]).toMatchObject({ amount: 24000, kind: 'postpaid', label: `후불 오더 완료 (${await noOf(o)})`, rate: '20.00' });
  expect(iso(e[0]!.effective_at)).toBe('2026-11-19T12:10:00.000Z');
  expect(iso(e[0]!.withdrawable_at)).toBe('2026-11-20T03:00:00.000Z');
  expect(await summary(w.d, '2026-11-19T21:05:00+09:00')).toEqual({ balance: 0, withdrawable: 0, pending: 24000 });
  expect(await summary(w.d, '2026-11-20T11:59:00+09:00')).toEqual({ balance: 24000, withdrawable: 0, pending: 0 });
  expect(await summary(w.d, '2026-11-20T12:00:00+09:00')).toEqual({ balance: 24000, withdrawable: 24000, pending: 0 });
});

test('현금 완료: −20% 즉시', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 30000, payment_method: 'cash' });
  await complete(o, '2026-11-19T21:00:00+09:00');
  const e = await entries(w.d);
  expect(e).toEqual([expect.objectContaining({ amount: -6000, kind: 'cash_fee', label: `현금 오더 수수료 (${await noOf(o)})` })]);
  expect(iso(e[0]!.effective_at)).toBe('2026-11-19T12:00:00.000Z');
  expect(await summary(w.d, '2026-11-19T21:00:00+09:00')).toEqual({ balance: -6000, withdrawable: 0, pending: 0 });
});

test('기사별 수수료율이 있으면 그것, 반올림', async () => {
  await w.db.query('insert into driver_rates(driver_id, commission_rate) values ($1, 15)', [w.d]);
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 33333, payment_method: 'postpaid' });
  await complete(o, '2026-11-19T21:00:00+09:00');
  expect((await entries(w.d))[0]).toMatchObject({ amount: 28333, rate: '15.00' }); // 수수료 5000 (4999.95 반올림)
});

test('완료 뒤 요금 변경은 차이만, 처음 비율로', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 30000, payment_method: 'postpaid' });
  await complete(o, '2026-11-19T21:00:00+09:00');
  await w.db.query('insert into driver_rates(driver_id, commission_rate) values ($1, 30)', [w.d]);
  await w.db.query('update orders set fare = 40000 where id = $1', [o]);
  const e = await entries(w.d);
  expect(e[1]).toMatchObject({ amount: 8000, kind: 'settle_adjust', label: `정산 변경 (${await noOf(o)})` });
  expect(iso(e[1]!.effective_at)).toBe(iso(e[0]!.effective_at));
  expect(iso(e[1]!.withdrawable_at)).toBe(iso(e[0]!.withdrawable_at));
});

test('10분 안에 되돌려도 잔액은 0 아래로 내려가지 않는다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 30000, payment_method: 'postpaid' });
  await complete(o, '2026-11-19T21:00:00+09:00');
  await w.db.query(`update orders set status = 'driving' where id = $1`, [o]);
  const e = await entries(w.d);
  expect(e.map(x => x.amount)).toEqual([24000, -24000]);
  expect(iso(e[1]!.effective_at)).toBe(iso(e[0]!.effective_at));
  expect(await summary(w.d, '2026-11-19T21:03:00+09:00')).toEqual({ balance: 0, withdrawable: 0, pending: 0 });
});

test('여러 번 바뀌어도 기사별 합은 최종 목표와 같다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 30000, payment_method: 'postpaid' });
  await complete(o, '2026-11-19T21:00:00+09:00');
  await w.db.query(`update orders set status = 'driving' where id = $1`, [o]);
  await complete(o, '2026-11-19T21:30:00+09:00');
  await w.db.query('update orders set driver_id = $2 where id = $1', [o, w.d2]);
  await w.db.query(`update orders set payment_method = 'cash' where id = $1`, [o]);
  expect(await sum(w.d)).toBe(0);
  expect(await sum(w.d2)).toBe(-6000);
});

test('정산 시작 전에 완료된 오더는 고쳐도 장부가 없다', async () => {
  await w.db.query(`update settings set settlement_start_at = '2026-11-20T00:00:00+09:00'`);
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 30000, payment_method: 'postpaid' });
  await complete(o, '2026-11-19T21:00:00+09:00');
  await w.db.query('update orders set fare = 50000 where id = $1', [o]);
  expect(await entries()).toEqual([]);
});

test('정산이 꺼져 있으면 장부가 없다', async () => {
  await w.db.query('update settings set settlement_start_at = null');
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 30000, payment_method: 'postpaid' });
  await complete(o, '2026-11-19T21:00:00+09:00');
  expect(await entries()).toEqual([]);
});

test('요금 0원이면 줄을 남기지 않는다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 0, payment_method: 'postpaid' });
  await complete(o, '2026-11-19T21:00:00+09:00');
  expect(await entries()).toEqual([]);
});

test('완료 시각이 비어 있으면 서버가 지금으로 채우고, 완료에서 벗어나면 지운다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 30000 });
  await w.db.query(`update orders set status = 'completed' where id = $1`, [o]);
  expect((await w.db.query('select completed_at is not null as v from orders where id = $1', [o])).rows[0]).toEqual({ v: true });
  await w.db.query(`update orders set status = 'driving' where id = $1`, [o]);
  expect((await w.db.query('select completed_at is null as v from orders where id = $1', [o])).rows[0]).toEqual({ v: true });
});

test('기사는 자기 장부만 읽고, 직접 쓸 수 없다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 30000 });
  await complete(o, '2026-11-19T21:00:00+09:00');
  expect((await as(w.db, w.d, tx => tx.query('select amount from wallet_entries'))).rows).toHaveLength(1);
  expect((await as(w.db, w.d2, tx => tx.query('select amount from wallet_entries'))).rows).toHaveLength(0);
  await expect(as(w.db, w.d, tx => tx.query(
    `insert into wallet_entries(driver_id, amount, kind, label, effective_at) values ($1, 100000, 'topup', 'x', now())`, [w.d]))).rejects.toThrow();
});

test('고객은 장부를 볼 수 없다, wallet_summary로 남의 잔액을 볼 수 없다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 30000 });
  await complete(o, '2026-11-19T21:00:00+09:00');
  expect((await as(w.db, w.a, tx => tx.query('select amount from wallet_entries'))).rows).toHaveLength(0);
  await expectError(as(w.db, w.d2, tx => tx.query('select * from wallet_summary($1)', [w.d])), 'FORBIDDEN');
  await expectError(as(w.db, w.a, tx => tx.query('select * from wallet_summary($1)', [w.d])), 'FORBIDDEN');
  expect((await as(w.db, w.op, tx => tx.query('select balance from wallet_summary($1)', [w.d]))).rows).toHaveLength(1);
});

test('완료 뒤 현금→후불로 바꾸면 후불 몫은 다음 날 12시부터 출금 (I1)', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 30000, payment_method: 'cash' });
  await complete(o, '2026-11-19T21:00:00+09:00');
  await w.db.query(`update orders set payment_method = 'postpaid' where id = $1`, [o]);
  const e = await entries(w.d);
  expect(e.map(x => [x.kind, x.amount])).toEqual([['cash_fee', -6000], ['settle_adjust', 6000], ['postpaid', 24000]]);
  expect(iso(e[2]!.withdrawable_at)).toBe('2026-11-20T03:00:00.000Z');
  expect(await summary(w.d, '2026-11-20T11:59:00+09:00')).toEqual({ balance: 24000, withdrawable: 0, pending: 0 });
});

test('정산 시작 전에 끝난 오더는 되돌렸다 다시 완료해도 장부가 없다 (I2)', async () => {
  await w.db.query(`update settings set settlement_start_at = '2026-11-20T00:00:00+09:00'`);
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 30000, payment_method: 'postpaid' });
  await complete(o, '2026-11-19T21:00:00+09:00');
  await w.db.query(`update orders set status = 'driving' where id = $1`, [o]);
  await complete(o, '2026-11-20T10:00:00+09:00');
  expect(await entries()).toEqual([]);
});
