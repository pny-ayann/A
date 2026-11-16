import { as, createWorld, expectError, seedOrder, ORDER_DEFAULTS } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
let o: string;
beforeEach(async () => {
  w = await createWorld();
  o = await seedOrder(w.db, w.A);
});

const assign = (orderId: string, driverId: string) =>
  w.db.query(`update orders set status='assigned', driver_id=$2, assigned_at=now() where id=$1`, [orderId, driverId]);

const insertAsCustomer = (userId: string, companyId: string, extra = '') =>
  as(w.db, userId, tx => tx.query<{ id: string }>(
    `insert into orders(company_id, pickup_address, dropoff_address, payment_method, fare${extra ? ', ' + extra.split('=')[0] : ''})
     values ($1, $2, $3, 'postpaid', 40000${extra ? ', ' + extra.split('=')[1] : ''}) returning id`,
    [companyId, ORDER_DEFAULTS.pickup_address, ORDER_DEFAULTS.dropoff_address]));

describe('접수', () => {
  test('고객은 자기 업체 오더를 접수한다', async () => {
    const r = await insertAsCustomer(w.a, w.A);
    const row = (await w.db.query('select created_by, status from orders where id=$1', [r.rows[0]!.id])).rows[0];
    expect(row).toEqual({ created_by: w.a, status: 'open' });
  });

  test('고객은 다른 업체 이름으로 접수할 수 없다', async () => {
    await expectError(insertAsCustomer(w.a, w.B), 'row-level security');
  });

  test('고객은 배차된 상태로 접수할 수 없다', async () => {
    await expectError(insertAsCustomer(w.a, w.A, `status='assigned'`), 'row-level security');
  });

  test('고객 a는 업체 B의 오더를 볼 수 없다', async () => {
    await seedOrder(w.db, w.B);
    const r = await as(w.db, w.a, tx => tx.query('select id from orders'));
    expect(r.rows).toEqual([{ id: o }]);
  });

  test('기사는 배정되지 않은 오더를 직접 조회할 수 없다', async () => {
    const r = await as(w.db, w.d, tx => tx.query('select id from orders'));
    expect(r.rows).toHaveLength(0);
  });
});

describe('고객 수정', () => {
  test('배차 전 요금을 자유롭게 바꾸고 이력이 남는다', async () => {
    await as(w.db, w.a, tx => tx.query('update orders set fare=60000 where id=$1', [o]));
    const ev = (await w.db.query(`select type, data, actor_id from order_events where order_id=$1`, [o])).rows;
    expect(ev).toContainEqual({ type: 'fare', data: { from: 50000, to: 60000 }, actor_id: w.a });
  });

  test('배차 후 고객의 직접 수정은 FORBIDDEN', async () => {
    await assign(o, w.d);
    await expectError(as(w.db, w.a, tx => tx.query('update orders set fare=1 where id=$1', [o])), 'FORBIDDEN');
  });

  test('고객이 status를 직접 바꾸려 하면 FORBIDDEN', async () => {
    await expectError(as(w.db, w.a, tx => tx.query(`update orders set status='completed' where id=$1`, [o])), 'FORBIDDEN');
  });

  test('기사는 orders를 직접 update할 수 없다', async () => {
    await assign(o, w.d);
    const r = await as(w.db, w.d, tx => tx.query('update orders set fare=1 where id=$1', [o])).catch(e => e as Error);
    if (r instanceof Error) expect(r.message).toContain('FORBIDDEN');
    else expect(r.affectedRows).toBe(0);
    expect((await w.db.query('select fare from orders where id=$1', [o])).rows[0]).toEqual({ fare: 50000 });
  });

  test('배차 후 사유 없는 요금 변경은 INVALID_AMENDMENT', async () => {
    await assign(o, w.d);
    await expectError(as(w.db, w.a, tx => tx.query(`select customer_amend_order($1,'dropoff_change',70000)`, [o])), 'INVALID_AMENDMENT');
    await expectError(as(w.db, w.a, tx => tx.query(`select customer_amend_order($1,'just_because',70000)`, [o])), 'INVALID_AMENDMENT');
  });

  test('배차 후 도착지 변경과 요금 변경은 허용되고 사유가 남는다', async () => {
    await assign(o, w.d);
    await as(w.db, w.a, tx => tx.query(
      `select customer_amend_order($1,'dropoff_change',70000,'{"address":"부산 해운대구","area":"해운대구 우동"}'::jsonb)`, [o]));
    expect((await w.db.query('select fare, dropoff_address, dropoff_area from orders where id=$1', [o])).rows[0])
      .toEqual({ fare: 70000, dropoff_address: '부산 해운대구', dropoff_area: '해운대구 우동' });
    const ev = (await w.db.query(`select reason from order_events where order_id=$1 and type='fare'`, [o])).rows;
    expect(ev).toEqual([{ reason: 'dropoff_change' }]);
  });

  test('배차 후 경유지 추가는 순번이 붙는다', async () => {
    await assign(o, w.d);
    await as(w.db, w.a, tx => tx.query(`select customer_amend_order($1,'waypoint_added',60000,null,'{"address":"수원"}'::jsonb)`, [o]));
    await as(w.db, w.a, tx => tx.query(`select customer_amend_order($1,'waypoint_added',65000,null,'{"address":"화성"}'::jsonb)`, [o]));
    const r = await w.db.query('select seq, address from order_waypoints where order_id=$1 order by seq', [o]);
    expect(r.rows).toEqual([{ seq: 1, address: '수원' }, { seq: 2, address: '화성' }]);
  });

  test('배차 후 미션 추가는 미션 요금을 기록한다', async () => {
    const m = (await w.db.query<{ id: string }>(`insert into missions(name, extra_fare) values ('세차', 10000) returning id`)).rows[0]!.id;
    await assign(o, w.d);
    await as(w.db, w.a, tx => tx.query(`select customer_amend_order($1,'mission_added',60000,null,null,$2)`, [o, m]));
    expect((await w.db.query('select extra_fare from order_missions where order_id=$1', [o])).rows).toEqual([{ extra_fare: 10000 }]);
  });

  test('다른 업체 고객은 amend할 수 없다', async () => {
    await assign(o, w.d);
    await expectError(as(w.db, w.b, tx => tx.query(`select customer_amend_order($1,'dropoff_change',1,'{"address":"x"}'::jsonb)`, [o])), 'NOT_FOUND');
  });

  test('완료된 오더는 amend할 수 없다', async () => {
    await w.db.query(`update orders set status='completed', driver_id=$2 where id=$1`, [o, w.d]);
    await expectError(as(w.db, w.a, tx => tx.query(`select customer_amend_order($1,'dropoff_change',1,'{"address":"x"}'::jsonb)`, [o])), 'INVALID_TRANSITION');
  });
});

describe('취소', () => {
  test('배차 전에는 고객이 취소한다', async () => {
    await as(w.db, w.a, tx => tx.query('select customer_cancel_order($1)', [o]));
    expect((await w.db.query('select status from orders where id=$1', [o])).rows[0]).toEqual({ status: 'cancelled' });
  });

  test('배차된 오더는 고객이 취소 못 한다', async () => {
    await assign(o, w.d);
    await expectError(as(w.db, w.a, tx => tx.query('select customer_cancel_order($1)', [o])), 'CANCEL_NOT_ALLOWED');
  });
});

describe('자주 쓰는 주소', () => {
  test('같은 주소로 3번 접수하면 use_count 3이고 top_addresses 첫 줄', async () => {
    await w.db.query(`insert into company_addresses(company_id, address, use_count) values ($1, '다른 곳', 2)`, [w.A]);
    for (let i = 0; i < 2; i++) await insertAsCustomer(w.a, w.A);
    // beforeEach seed 1건 + 2건 = 출발지 3회
    const r = await as(w.db, w.a, tx => tx.query<{ address: string; use_count: number }>(
      'select address, use_count from top_addresses($1)', [w.A]));
    // 출발지와 도착지가 둘 다 3회라 둘이 1, 2등을 나눠 가진다
    expect(r.rows.slice(0, 2)).toContainEqual({ address: ORDER_DEFAULTS.pickup_address, use_count: 3 });
    expect(r.rows[2]).toEqual({ address: '다른 곳', use_count: 2 });
  });

  test('고정한 주소는 많이 쓴 주소보다 먼저 나온다', async () => {
    await w.db.query(`insert into company_addresses(company_id, address, pinned) values ($1, '고정 주소', true)`, [w.A]);
    const r = await as(w.db, w.a, tx => tx.query<{ address: string }>('select address from top_addresses($1)', [w.A]));
    expect(r.rows[0]!.address).toBe('고정 주소');
  });

  test('최대 10개', async () => {
    for (let i = 0; i < 12; i++) await w.db.query(`insert into company_addresses(company_id, address) values ($1, $2)`, [w.A, `주소${i}`]);
    const r = await as(w.db, w.a, tx => tx.query('select * from top_addresses($1)', [w.A]));
    expect(r.rows).toHaveLength(10);
  });

  test('다른 업체 주소는 top_addresses로도 안 나온다', async () => {
    const r = await as(w.db, w.b, tx => tx.query('select * from top_addresses($1)', [w.A]));
    expect(r.rows).toHaveLength(0);
  });
});

describe('관제와 기록', () => {
  test('관제의 요금 수정은 audit_log에 남는다', async () => {
    await as(w.db, w.op, tx => tx.query('update orders set fare=55000 where id=$1', [o]));
    const log = (await w.db.query(`select actor_id, table_name from audit_log where row_id=$1 and action='UPDATE'`, [o])).rows;
    expect(log).toContainEqual({ actor_id: w.op, table_name: 'orders' });
  });

  test('관제는 배차된 오더의 주소도 바꿀 수 있고 edit 이벤트가 남는다', async () => {
    await assign(o, w.d);
    await as(w.db, w.op, tx => tx.query(`update orders set pickup_address='인천' where id=$1`, [o]));
    const ev = (await w.db.query(`select data from order_events where order_id=$1 and type='edit'`, [o])).rows;
    expect(ev).toEqual([{ data: ['pickup_address'] }]);
  });

  test('관리자의 업체 설정 변경도 audit_log에 남는다', async () => {
    await as(w.db, w.admin, tx => tx.query(`update companies set fuel_billing='company' where id=$1`, [w.A]));
    const log = (await w.db.query(`select actor_id from audit_log where row_id=$1 and table_name='companies'`, [w.A])).rows;
    expect(log).toContainEqual({ actor_id: w.admin });
  });

  test('updated_at이 갱신된다', async () => {
    await w.db.query(`update orders set updated_at = now() - interval '1 day' where id=$1`, [o]);
    await as(w.db, w.op, tx => tx.query('update orders set fare=1 where id=$1', [o]));
    const r = await w.db.query<{ fresh: boolean }>(`select updated_at > now() - interval '1 minute' fresh from orders where id=$1`, [o]);
    expect(r.rows[0]!.fresh).toBe(true);
  });
});
