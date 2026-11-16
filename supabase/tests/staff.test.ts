import { as, createWorld, expectError, seedOrder, seedPhotos } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

const assign = async (staff: string, order: string, driver: string) =>
  (await as(w.db, staff, tx => tx.query<{ w: string[] }>('select staff_assign($1, $2) w', [order, driver]))).rows[0]!.w;
const setStatus = (staff: string, order: string, s: string, reason: string | null = null) =>
  as(w.db, staff, tx => tx.query('select staff_set_status($1, $2, $3)', [order, s, reason]));
const row = async (order: string) =>
  (await w.db.query<{ status: string; driver_id: string | null }>('select status, driver_id from orders where id=$1', [order])).rows[0]!;

describe('강제 배차', () => {
  test('일반 관제도 관제 배차 전용 오더를 배정할 수 있다', async () => {
    const o = await seedOrder(w.db, w.A, { dispatch_mode: 'staff_only' });
    expect(await assign(w.op, o, w.d)).toEqual([]);
    expect(await row(o)).toEqual({ status: 'assigned', driver_id: w.d });
  });

  test('일반 오더 진행 중인 기사에게 배정하면 경고만 주고 배정된다', async () => {
    await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    const o2 = await seedOrder(w.db, w.A);
    expect(await assign(w.op, o2, w.d)).toEqual(['HAS_ACTIVE_ORDER']);
    expect((await row(o2)).driver_id).toBe(w.d);
  });

  test('이미 배정된 오더는 다른 기사로 재배차되고 이력이 남는다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d });
    await assign(w.op, o, w.d2);
    expect(await row(o)).toEqual({ status: 'assigned', driver_id: w.d2 });
    const ev = (await w.db.query(`select actor_id, data from order_events where order_id=$1 and type='reassigned'`, [o])).rows;
    expect(ev).toEqual([{ actor_id: w.op, data: { from: w.d, to: w.d2 } }]);
  });

  test('운행 중인 오더는 강제 배차로 기사를 바꿀 수 없다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    await expectError(assign(w.op, o, w.d2), 'INVALID_TRANSITION');
  });

  test('대기 중 기사에게는 배정할 수 없다', async () => {
    const o = await seedOrder(w.db, w.A);
    await expectError(assign(w.op, o, w.dp), 'DRIVER_NOT_ACTIVE');
  });

  test('고객과 기사는 staff_assign을 쓸 수 없다', async () => {
    const o = await seedOrder(w.db, w.A);
    await expectError(assign(w.a, o, w.d), 'FORBIDDEN');
    await expectError(assign(w.d, o, w.d), 'FORBIDDEN');
  });
});

describe('회수', () => {
  test('회수하면 open으로 돌아가고 기사가 비워진다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'arrived_pickup', driver_id: w.d });
    await as(w.db, w.op, tx => tx.query('select staff_unassign($1, $2)', [o, '기사 요청']));
    expect(await row(o)).toEqual({ status: 'open', driver_id: null });
    const ev = (await w.db.query(`select reason from order_events where order_id=$1 and type='unassigned'`, [o])).rows;
    expect(ev).toEqual([{ reason: '기사 요청' }]);
  });

  test('회수는 사유가 필요하다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d });
    await expectError(as(w.db, w.op, tx => tx.query('select staff_unassign($1, $2)', [o, ' '])), 'REASON_REQUIRED');
  });
});

describe('상태 변경', () => {
  test('사진 없이 완료로 바꾸려면 사유가 필요하다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    await expectError(setStatus(w.op, o, 'completed'), 'REASON_REQUIRED');
  });

  test('일반 관제가 사유를 적으면 사진 없이 완료되고 photo_override가 남는다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    await seedPhotos(w.db, o, 'pickup');
    await setStatus(w.op, o, 'completed', '기사 휴대폰 고장');
    expect((await row(o)).status).toBe('completed');
    const ev = (await w.db.query(`select actor_id, reason, data from order_events where order_id=$1 and type='photo_override'`, [o])).rows;
    expect(ev).toEqual([{ actor_id: w.op, reason: '기사 휴대폰 고장', data: { missing: { dropoff: ['front', 'back', 'left', 'right', 'dashboard'] } } }]);
  });

  test('출발 사진 없이 운행 중으로 바꾸려면 사유가 필요하다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'arrived_pickup', driver_id: w.d });
    await expectError(setStatus(w.op, o, 'driving'), 'REASON_REQUIRED');
  });

  test('사진이 다 있으면 사유 없이 완료로 바꿀 수 있다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    await seedPhotos(w.db, o, 'pickup');
    await seedPhotos(w.db, o, 'dropoff');
    await setStatus(w.op, o, 'completed');
    const ev = (await w.db.query(`select id from order_events where order_id=$1 and type='photo_override'`, [o])).rows;
    expect(ev).toHaveLength(0);
  });

  test('취소는 사유가 필요하다', async () => {
    const o = await seedOrder(w.db, w.A);
    await expectError(setStatus(w.op, o, 'cancelled'), 'REASON_REQUIRED');
    await setStatus(w.op, o, 'cancelled', '고객 요청');
    expect((await row(o)).status).toBe('cancelled');
  });

  test('완료를 운행 중으로 되돌릴 수 있다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'completed', driver_id: w.d });
    await seedPhotos(w.db, o, 'pickup');
    await setStatus(w.op, o, 'driving');
    expect((await row(o)).status).toBe('driving');
  });

  test('open으로 바꾸면 기사가 비워진다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d });
    await setStatus(w.op, o, 'open');
    expect(await row(o)).toEqual({ status: 'open', driver_id: null });
  });

  test('기사가 없는 오더를 진행 상태로 바꿀 수 없다', async () => {
    const o = await seedOrder(w.db, w.A);
    await expectError(setStatus(w.op, o, 'arrived_pickup'), 'INVALID_TRANSITION');
  });

  test('고객과 기사는 staff_set_status를 쓸 수 없다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    await expectError(setStatus(w.d, o, 'completed', 'x'), 'FORBIDDEN');
    await expectError(setStatus(w.a, o, 'completed', 'x'), 'FORBIDDEN');
  });
});
