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
