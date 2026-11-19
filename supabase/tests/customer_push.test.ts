import { as, createUser, createWorld, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
let a2: string;
beforeEach(async () => {
  w = await createWorld();
  a2 = await createUser(w.db, { loginId: 'cust_a2', role: 'customer', companyId: w.A });
  // 상사A 고객 2명, 상사B 고객 1명, 기사·관제도 토큰을 넣어 두고 안 가는지 본다
  for (const [id, t] of [[w.a, 'C_a'], [a2, 'C_a2'], [w.b, 'C_b'], [w.d, 'T_d'], [w.op, 'T_op']] as const) {
    await w.db.query('insert into push_tokens(user_id, token) values ($1, $2)', [id, t]);
  }
});

type Msg = { to: string; title: string; body: string; data: { orderId?: string; screen: string } };
const sent = async () =>
  (await w.db.query<{ body: Msg[] }>('select body from net.http_requests_log order by id')).rows.flatMap(r => r.body);
const clear = () => w.db.query('delete from net.http_requests_log');
/** 고객 토큰(C_)으로 간 것만 */
const toCustomers = async () => (await sent()).filter(m => m.to.startsWith('C_'));
const tokens = (ms: Msg[]) => ms.map(m => m.to).sort();

describe('고객 오더 알림', () => {
  test('배차되면 그 업체 고객들에게만 기사 이름과 함께 알린다', async () => {
    const o = await seedOrder(w.db, w.A, { vehicle_number: '12가3456' });
    await clear();
    await as(w.db, w.d, tx => tx.query('select claim_order($1, null, null)', [o]));
    const m = await toCustomers();
    expect(tokens(m)).toEqual(['C_a', 'C_a2']);
    expect(m[0]).toMatchObject({ title: '배차됐어요 · 김기사', body: '중구 태평로1가 → 강남구 역삼동 · 12가3456', data: { orderId: o, screen: 'order' } });
  });

  test('운행 시작(출발)과 완료를 알린다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'arrived_pickup', driver_id: w.d });
    await clear();
    await w.db.query(`update orders set status = 'driving' where id = $1`, [o]);
    expect((await toCustomers()).map(m => m.title)).toEqual(['출발했어요', '출발했어요']);
    await clear();
    await w.db.query(`update orders set status = 'completed' where id = $1`, [o]);
    const m = await toCustomers();
    expect(m.map(x => x.title)).toEqual(['도착 완료', '도착 완료']);
    expect(m[0]!.data).toEqual({ orderId: o, screen: 'order' });
  });

  test('관제가 취소하면 알리고, 고객 스스로 취소하면 알리지 않는다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d });
    await clear();
    await as(w.db, w.op, tx => tx.query(`select staff_set_status($1, 'cancelled', '고객 요청')`, [o]));
    expect(tokens((await toCustomers()).filter(m => m.title === '관제가 오더를 취소했어요'))).toEqual(['C_a', 'C_a2']);

    const o2 = await seedOrder(w.db, w.A);
    await clear();
    await as(w.db, w.a, tx => tx.query('select customer_cancel_order($1)', [o2]));
    expect(await toCustomers()).toEqual([]);
  });

  test('상태가 그대로인 요금 변경이나 다른 수정은 고객에게 보내지 않는다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d, fare: 35000 });
    await clear();
    await as(w.db, w.op, tx => tx.query('update orders set fare = 40000, driver_memo = $2 where id = $1', [o, '메모']));
    expect(await toCustomers()).toEqual([]);
  });

  test('다른 업체 오더의 변화는 받지 않는다', async () => {
    const o = await seedOrder(w.db, w.B);
    await clear();
    await as(w.db, w.d, tx => tx.query('select claim_order($1, null, null)', [o]));
    expect(tokens(await toCustomers())).toEqual(['C_b']);
  });
});

describe('고객 문의 알림', () => {
  test('관제가 고객 문의에 쓰면 그 업체 고객에게, 채팅 글은 넣지 않는다', async () => {
    const o = await seedOrder(w.db, w.A);
    await clear();
    await as(w.db, w.op, tx => tx.query(`insert into messages(order_id, thread, body) values ($1, 'customer', '연락처 010-1234-5678')`, [o]));
    const m = await toCustomers();
    expect(tokens(m)).toEqual(['C_a', 'C_a2']);
    expect(m[0]).toMatchObject({ title: '관제 메시지', body: '관제에서 메시지가 왔어요', data: { orderId: o, screen: 'chat' } });
    expect(JSON.stringify(m)).not.toContain('010-1234-5678');
  });

  test('고객이 쓴 문의는 고객에게 보내지 않는다', async () => {
    const o = await seedOrder(w.db, w.A);
    await clear();
    await as(w.db, w.a, tx => tx.query(`insert into messages(order_id, thread, body) values ($1, 'customer', '언제 와요?')`, [o]));
    expect(await toCustomers()).toEqual([]);
  });
});

test('발송이 실패해도 상태 변경은 막지 않는다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'arrived_pickup', driver_id: w.d });
  await w.db.exec(`create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
    headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language plpgsql as $$
    begin raise exception 'network down'; end $$;`);
  await w.db.query(`update orders set status = 'driving' where id = $1`, [o]);
  expect((await w.db.query<{ status: string }>('select status from orders where id = $1', [o])).rows[0]!.status).toBe('driving');
});

test('company_customer_ids는 앱에서 부를 수 없다', async () => {
  await expect(as(w.db, w.a, tx => tx.query('select company_customer_ids($1)', [w.A]))).rejects.toThrow(/permission denied/);
});
