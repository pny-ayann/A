import { as, createUser, createWorld, expectError, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => {
  w = await createWorld();
  // 모두 휴대폰 토큰 1개씩 (대기 기사·고객·관제도 넣어 두고 안 가는지 본다)
  for (const [id, t] of [[w.d, 'T_d'], [w.d2, 'T_d2'], [w.dp, 'T_dp'], [w.a, 'T_a'], [w.op, 'T_op']] as const) {
    await w.db.query('insert into push_tokens(user_id, token) values ($1, $2)', [id, t]);
  }
});

type Msg = { to: string; title: string; body: string; data: { orderId?: string; screen: string } };
/** 지금까지 Expo로 보낸 요청들 (요청 하나 = 메시지 배열) */
const requests = async () =>
  (await w.db.query<{ url: string; body: Msg[] }>('select url, body from net.http_requests_log order by id')).rows;
const sent = async () => (await requests()).flatMap(r => r.body);
const clear = () => w.db.query('delete from net.http_requests_log');
const tokens = (ms: Msg[]) => ms.map(m => m.to).sort();
/** 고객 알림(0015, customer_push.test.ts에서 따로 검사)을 뺀 기사·관제 쪽 알림 */
const notToCustomer = async () => (await sent()).filter(m => m.to !== 'T_a');

describe('새 오더', () => {
  test('공개 오더가 생기면 승인된 기사 모두에게 한 번에 보낸다', async () => {
    const o = await seedOrder(w.db, w.A, { reserved_at: '2026-11-18T05:00:00Z', fare: 35000 });
    const r = await requests();
    expect(r).toHaveLength(1);
    expect(r[0]!.url).toBe('https://exp.host/--/api/v2/push/send');
    expect(tokens(r[0]!.body)).toEqual(['T_d', 'T_d2']);
    expect(r[0]!.body[0]).toMatchObject({
      title: '새 오더',
      body: expect.stringMatching(/^\[예약\] 11\/18 14:00 · \[\d{4}-001\] 중구 태평로1가 → 강남구 역삼동 · 35,000원$/),
      data: { orderId: o, screen: 'list' },
    });
  });

  test('관제 배차 전용 오더는 알리지 않는다', async () => {
    await seedOrder(w.db, w.A, { dispatch_mode: 'staff_only' });
    expect(await requests()).toEqual([]);
  });

  test('기사가 반납하면 다른 승인 기사에게만 다시 알린다', async () => {
    const o = await seedOrder(w.db, w.A);
    await as(w.db, w.d, tx => tx.query('select claim_order($1, null, null)', [o]));
    await clear();
    await as(w.db, w.d, tx => tx.query('select release_order($1, $2)', [o, '너무 멀어요']));
    expect(tokens(await sent())).toEqual(['T_d2']);
  });
});

describe('기사 개인 알림', () => {
  test('기사가 직접 잡으면 본인에게 보내지 않는다', async () => {
    const o = await seedOrder(w.db, w.A);
    await clear();
    await as(w.db, w.d, tx => tx.query('select claim_order($1, null, null)', [o]));
    expect(await notToCustomer()).toEqual([]);
  });

  test('관제가 배정하면 그 기사에게 배차 알림', async () => {
    const o = await seedOrder(w.db, w.A, { dispatch_mode: 'staff_only' });
    await as(w.db, w.op, tx => tx.query('select staff_assign($1, $2)', [o, w.d2]));
    const m = await notToCustomer();
    expect(tokens(m)).toEqual(['T_d2']);
    expect(m[0]).toMatchObject({ title: '배차됐어요', data: { orderId: o, screen: 'order' } });
  });

  test('관제가 요금을 바꾸면 배정 기사에게 알린다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d, fare: 35000 });
    await clear();
    await as(w.db, w.op, tx => tx.query('update orders set fare = 40000 where id = $1', [o]));
    const m = await sent();
    expect(tokens(m)).toEqual(['T_d']);
    expect(m[0]).toMatchObject({ title: '요금이 바뀌었어요', body: '35,000원 → 40,000원', data: { orderId: o, screen: 'order' } });
  });

  test('관제가 회수하면 원래 기사에게 알리고, 다른 승인 기사에게 새 오더를 알린다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d });
    await clear();
    await as(w.db, w.op, tx => tx.query('select staff_unassign($1, $2)', [o, '연락 안 됨']));
    const m = await sent();
    expect(m.filter(x => x.to === 'T_d')).toEqual([expect.objectContaining({ title: '관제가 오더를 회수했어요', data: { orderId: o, screen: 'list' } })]);
    expect(m.filter(x => x.title === '새 오더').map(x => x.to)).toEqual(['T_d2']);
  });

  test('관제가 취소하면 원래 기사에게 알린다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'arrived_pickup', driver_id: w.d });
    await clear();
    await as(w.db, w.op, tx => tx.query('select staff_set_status($1, $2, $3)', [o, 'cancelled', '고객 취소']));
    const m = await notToCustomer();
    expect(m).toEqual([expect.objectContaining({ to: 'T_d', title: '관제가 오더를 취소했어요' })]);
  });
});

describe('관제 메시지', () => {
  test('관제가 기사 문의에 쓰면 그 오더의 기사에게 알린다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d });
    await clear();
    await as(w.db, w.op, tx => tx.query(`insert into messages(order_id, thread, body) values ($1, 'driver', '정문으로 오세요')`, [o]));
    const m = await sent();
    expect(m).toEqual([expect.objectContaining({ to: 'T_d', title: '관제 메시지', body: '관제에서 메시지가 왔어요', data: { orderId: o, screen: 'chat' } })]);
  });

  test('기사가 보낸 메시지와 고객 문의는 기사에게 보내지 않는다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d });
    await clear();
    await as(w.db, w.d, tx => tx.query(`insert into messages(order_id, thread, body) values ($1, 'driver', '도착했어요')`, [o]));
    await as(w.db, w.op, tx => tx.query(`insert into messages(order_id, thread, body) values ($1, 'customer', '고객님 안내')`, [o]));
    expect(await notToCustomer()).toEqual([]);
  });
});

describe('관제 메시지 내용은 잠금화면에 보이지 않는다', () => {
  test('알림 내용에 채팅 글이 들어가지 않는다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d });
    await clear();
    await as(w.db, w.op, tx => tx.query(`insert into messages(order_id, thread, body) values ($1, 'driver', '비밀번호 1234')`, [o]));
    const m = await sent();
    expect(m).toHaveLength(1);
    expect(JSON.stringify(m)).not.toContain('1234');
  });
});

describe('claim_push_token (휴대폰을 다른 기사가 이어 쓸 때)', () => {
  const owners = async (t: string) =>
    (await w.db.query<{ user_id: string }>('select user_id from push_tokens where token = $1 order by user_id', [t])).rows.map(r => r.user_id);

  test('앞사람 토큰 줄을 지우고 지금 사람 것으로 등록한다', async () => {
    // 기사 d가 오프라인에서 로그아웃해 T_d 줄이 남아 있는 상태에서 d2가 같은 휴대폰으로 로그인
    await as(w.db, w.d2, tx => tx.query(`select claim_push_token('T_d')`));
    expect(await owners('T_d')).toEqual([w.d2]);
    // d2의 다른 휴대폰 토큰은 그대로
    expect(await owners('T_d2')).toEqual([w.d2]);
  });

  test('이후 앞사람 알림은 이 휴대폰으로 오지 않는다', async () => {
    await as(w.db, w.d2, tx => tx.query(`select claim_push_token('T_d')`));
    await w.db.query(`select send_push(array[$1::uuid], '제목', '내용', '{}')`, [w.d]);
    expect(await requests()).toEqual([]);
  });

  test('같은 사람이 다시 부르면 그대로 한 줄이다', async () => {
    await as(w.db, w.d, tx => tx.query(`select claim_push_token('T_d')`));
    await as(w.db, w.d, tx => tx.query(`select claim_push_token('T_d')`));
    expect(await owners('T_d')).toEqual([w.d]);
  });

  test('빈 토큰은 거절한다', async () => {
    await expectError(as(w.db, w.d, tx => tx.query(`select claim_push_token('')`)), 'INVALID_TOKEN');
  });

  test('로그인 안 한 사람은 부를 수 없다', async () => {
    await expectError(w.db.transaction(async tx => {
      await tx.exec('set local role anon');
      await tx.query(`select claim_push_token('T_d')`);
    }), 'permission denied');
    expect(await owners('T_d')).toEqual([w.d]);
  });
});

describe('send_push', () => {
  test('토큰이 100개를 넘으면 100개씩 나눠 보낸다', async () => {
    const many = await createUser(w.db, { loginId: 'many', role: 'driver', driverStatus: 'active' });
    for (let i = 0; i < 150; i++) await w.db.query('insert into push_tokens(user_id, token) values ($1, $2)', [many, `M${i}`]);
    await w.db.query(`select send_push(array[$1::uuid], '제목', '내용', '{"screen":"list"}')`, [many]);
    expect((await requests()).map(r => r.body.length)).toEqual([100, 50]);
  });

  test('토큰이 없으면 아무것도 보내지 않는다', async () => {
    const none = await createUser(w.db, { loginId: 'none', role: 'driver', driverStatus: 'active' });
    await w.db.query(`select send_push(array[$1::uuid], '제목', '내용', '{}')`, [none]);
    expect(await requests()).toEqual([]);
  });

  test('로그인한 사용자는 send_push를 직접 부를 수 없다', async () => {
    await expectError(as(w.db, w.d, tx => tx.query(`select send_push(array[$1::uuid], 'x', 'y', '{}')`, [w.d])), 'permission denied');
  });

  test('발송이 실패해도 오더 저장은 막지 않는다', async () => {
    await w.db.exec(`create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
      headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language plpgsql as $$
      begin raise exception 'network down'; end $$;`);
    const o = await seedOrder(w.db, w.A);
    expect((await w.db.query('select id from orders where id = $1', [o])).rows).toHaveLength(1);
  });
});
