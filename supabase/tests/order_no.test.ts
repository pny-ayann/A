import { as, createWorld, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

const noOf = async (id: string) =>
  (await w.db.query<{ order_no: string }>('select order_no from orders where id = $1', [id])).rows[0]!.order_no;

test('접수 날짜(한국)와 그날 순번으로 번호를 붙인다', async () => {
  const a = await seedOrder(w.db, w.A, { created_at: '2026-11-19T00:30:00+09:00' });
  const b = await seedOrder(w.db, w.A, { created_at: '2026-11-19T00:40:00+09:00' });
  expect([await noOf(a), await noOf(b)]).toEqual(['1119-001', '1119-002']);
});

test('한국 날짜가 바뀌면 001부터 다시', async () => {
  const a = await seedOrder(w.db, w.A, { created_at: '2026-11-19T23:59:00+09:00' });
  const b = await seedOrder(w.db, w.A, { created_at: '2026-11-20T00:01:00+09:00' });
  expect([await noOf(a), await noOf(b)]).toEqual(['1119-001', '1120-001']);
});

test('사람이 번호를 넣거나 고칠 수 없다', async () => {
  const a = await seedOrder(w.db, w.A, { created_at: '2026-11-19T10:00:00+09:00', order_no: 'X' });
  expect(await noOf(a)).toBe('1119-001');
  await as(w.db, w.op, tx => tx.query(`update orders set order_no = 'Y' where id = $1`, [a]));
  expect(await noOf(a)).toBe('1119-001');
});

test('푸시 본문 경로 앞에 번호가 붙는다', async () => {
  await w.db.query(`insert into push_tokens(user_id, token) values ($1, 'T_d')`, [w.d]);
  await seedOrder(w.db, w.A, { created_at: '2026-11-19T10:00:00+09:00', fare: 35000 });
  const r = await w.db.query<{ body: { body: string }[] }>('select body from net.http_requests_log');
  expect(r.rows[0]!.body[0]!.body).toBe('[1119-001] 중구 태평로1가 → 강남구 역삼동 · 35,000원');
});

test('기사 공개 오더 목록에도 번호가 있다', async () => {
  await seedOrder(w.db, w.A, { created_at: '2026-11-19T10:00:00+09:00' });
  const r = await as(w.db, w.d, tx => tx.query<{ order_no: string }>('select order_no from list_open_orders(null, null)'));
  expect(r.rows).toEqual([{ order_no: '1119-001' }]);
});

test('1년 뒤 같은 날짜에도 접수가 막히지 않는다 (C2)', async () => {
  const a = await seedOrder(w.db, w.A, { created_at: '2026-11-16T10:00:00+09:00' });
  const b = await seedOrder(w.db, w.A, { created_at: '2027-11-16T10:00:00+09:00' });
  expect([await noOf(a), await noOf(b)]).toEqual(['1116-001', '1116-001']);
});

test('앱에서 접수하면 접수 시각을 마음대로 넣을 수 없다 (C2)', async () => {
  const r = await as(w.db, w.a, tx => tx.query<{ old: boolean }>(
    `select create_order(jsonb_build_object('company_id', $1::text, 'kind', 'takson', 'pickup_address', 'a', 'dropoff_address', 'b',
       'payment_method', 'postpaid', 'fare', 1000, 'created_at', '2020-01-01T00:00:00Z'), '[]'::jsonb, '{}'::uuid[]) as id`, [w.A]));
  const id = (r.rows[0] as unknown as { id: string }).id;
  const o = (await w.db.query<{ y: number }>(`select extract(year from created_at)::int as y from orders where id = $1`, [id])).rows[0]!;
  expect(o.y).toBeGreaterThan(2020);
  await as(w.db, w.a, tx => tx.query(
    `insert into orders(company_id, pickup_address, dropoff_address, payment_method, fare, created_at, created_by) values ($1, 'a', 'b', 'postpaid', 1000, '2020-01-01T00:00:00Z', $2)`, [w.A, w.a]));
  expect((await w.db.query(`select count(*)::int as n from orders where created_at < '2021-01-01'`)).rows[0]).toEqual({ n: 0 });
});
