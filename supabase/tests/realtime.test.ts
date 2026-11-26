import { as, createDb, createWorld, seedOrder } from './helpers/db';

test('실시간 발행 목록에 오더·이력·메시지·기사 위치·서류가 들어 있다', async () => {
  const db = await createDb();
  const r = await db.query<{ tablename: string }>(
    `select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1`);
  expect(r.rows.map(x => x.tablename)).toEqual(['driver_locations', 'messages', 'order_documents', 'order_events', 'orders', 'wallet_entries', 'withdrawal_requests']);
});

// 실시간 서버는 구독자마다 그 사람 역할로 읽기 규칙(RLS)을 검사한다.
// 로그인 전(anon) 구독자 검사에서 오류가 나면 같은 변경을 기다리던 모든 구독자에게 전달이 멈춘다.
// 그래서 anon이 이 표들을 읽으면 오류 없이 0줄이어야 한다.
test('로그인 안 한(anon) 사람이 실시간 표를 읽어도 오류 없이 0줄', async () => {
  const w = await createWorld();
  const order = await seedOrder(w.db, w.A);
  await w.db.query(`insert into public.messages(order_id, thread, sender_id, body) values ($1, 'customer', $2, '안녕하세요')`, [order, w.a]);
  await w.db.query(`insert into public.order_events(order_id, type) values ($1, 'status')`, [order]);
  await w.db.query(`insert into public.driver_locations(driver_id, lat, lng) values ($1, 37.5, 127.0)`, [w.d]);
  await w.db.query(`insert into public.wallet_entries(driver_id, amount, kind, label) values ($1, 1000, 'topup', '충전')`, [w.d]);
  for (const t of ['orders', 'order_events', 'messages', 'driver_locations', 'wallet_entries', 'withdrawal_requests', 'order_documents']) {
    const n = await w.db.transaction(async tx => {
      await tx.exec('set local role anon');
      return (await tx.query<{ n: number }>(`select count(*)::int as n from public.${t}`)).rows[0]!.n;
    });
    expect([t, n]).toEqual([t, 0]);
  }
});

test('로그인한 관제는 그대로 다 본다', async () => {
  const w = await createWorld();
  const order = await seedOrder(w.db, w.A);
  await w.db.query(`insert into public.messages(order_id, thread, sender_id, body) values ($1, 'customer', $2, '안녕하세요')`, [order, w.a]);
  const n = await as(w.db, w.op, async tx => (await tx.query<{ n: number }>('select count(*)::int as n from public.messages')).rows[0]!.n);
  expect(n).toBe(1);
});
