import { createDb } from './helpers/db';

test('실시간 발행 목록에 오더·이력·메시지·기사 위치가 들어 있다', async () => {
  const db = await createDb();
  const r = await db.query<{ tablename: string }>(
    `select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1`);
  expect(r.rows.map(x => x.tablename)).toEqual(['driver_locations', 'messages', 'order_events', 'orders']);
});
