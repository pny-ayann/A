import { createDb, as } from './helpers/db';

test('마이그레이션이 적용되고 authenticated 역할에서 RLS가 동작한다', async () => {
  const db = await createDb();
  await db.exec(`create table public.t_probe(id int, owner uuid default auth.uid());
    alter table public.t_probe enable row level security;
    create policy p on public.t_probe for select using (owner = auth.uid());
    insert into public.t_probe(id, owner) values (1, '00000000-0000-0000-0000-000000000001');`);
  const rows = await as(db, '00000000-0000-0000-0000-000000000002', tx =>
    tx.query('select * from public.t_probe'));
  expect(rows.rows).toHaveLength(0);
  const mine = await as(db, '00000000-0000-0000-0000-000000000001', tx =>
    tx.query('select * from public.t_probe'));
  expect(mine.rows).toHaveLength(1);
});
