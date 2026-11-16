// 최종 검토에서 나온 우회 경로들
import { as, createWorld, expectError, seedOrder, SLOTS } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

const fromNow = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString();

test('사진 파일 없이 사진 행만 넣으면 운행 시작이 PHOTOS_REQUIRED', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'arrived_pickup', driver_id: w.d });
  for (const s of SLOTS) {
    await as(w.db, w.d, tx => tx.query('insert into order_photos(order_id, phase, slot, path) values ($1, $2, $3, $4)',
      [o, 'pickup', s, `${o}/pickup/${s}.jpg`]));
  }
  await expectError(as(w.db, w.d, tx => tx.query('select advance_order($1)', [o])), 'PHOTOS_REQUIRED');
});

test('사진 경로는 그 오더와 단계 폴더여야 한다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'arrived_pickup', driver_id: w.d });
  await expectError(as(w.db, w.d, tx => tx.query('insert into order_photos(order_id, phase, slot, path) values ($1, $2, $3, $4)',
    [o, 'pickup', 'front', 'x'])), 'check');
});

test('사진 올린 사람은 위조할 수 없다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'arrived_pickup', driver_id: w.d });
  await as(w.db, w.d, tx => tx.query('insert into order_photos(order_id, phase, slot, path, uploaded_by) values ($1, $2, $3, $4, $5)',
    [o, 'pickup', 'front', `${o}/pickup/front.jpg`, w.op]));
  expect((await w.db.query('select uploaded_by from order_photos where order_id=$1', [o])).rows).toEqual([{ uploaded_by: w.d }]);
});

test('영수증 경로는 그 오더 폴더여야 한다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
  await expectError(as(w.db, w.d, tx => tx.query(`insert into fuel_receipts(order_id, amount, path) values ($1, 1000, 'x')`, [o])), 'check');
});

test('예약 오더를 운행 중이면 일반 오더를 잡을 수 없다', async () => {
  const r = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, reserved_at: fromNow(-40) });
  const o = await seedOrder(w.db, w.A);
  expect(r).toBeTruthy();
  await expectError(as(w.db, w.d, tx => tx.query('select claim_order($1)', [o])), 'HAS_ACTIVE_ORDER');
});

test('공개 목록 거리는 0.5km 단위로 올림한다', async () => {
  await seedOrder(w.db, w.A, { pickup_lat: 37.5665, pickup_lng: 126.978 });
  // 약 0.11km 떨어진 곳
  const km = (await as(w.db, w.d, tx => tx.query<{ distance_km: number }>('select distance_km from list_open_orders(37.5675, 126.978)'))).rows[0]!.distance_km;
  expect(km).toBe(0.5);
});

test('관제가 상태를 직접 바꾸면 FORBIDDEN (staff_set_status를 써야 기록이 남는다)', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
  await expectError(as(w.db, w.op, tx => tx.query(`update orders set status='completed' where id=$1`, [o])), 'FORBIDDEN');
});

test('관제가 기사를 직접 넣으면 FORBIDDEN (staff_assign을 써야 한다)', async () => {
  const o = await seedOrder(w.db, w.A);
  await expectError(as(w.db, w.op, tx => tx.query(`update orders set driver_id=$2 where id=$1`, [o, w.dp])), 'FORBIDDEN');
});

test('관제는 다른 항목은 여전히 직접 고친다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
  await as(w.db, w.op, tx => tx.query(`update orders set fare=1, dispatch_mode='staff_only' where id=$1`, [o]));
});

test('로그인 안 한 사람은 함수를 호출할 수 없다', async () => {
  await expectError(w.db.transaction(async tx => {
    await tx.exec('set local role anon');
    await tx.query('select driver_conflicts($1, null)', [w.d]);
  }), 'permission denied');
});

test('고객은 다른 기사의 충돌 정보를 볼 수 없다', async () => {
  await expectError(as(w.db, w.a, tx => tx.query('select driver_conflicts($1, null)', [w.d])), 'FORBIDDEN');
});

test('다른 업체 오더의 사진 현황은 볼 수 없다', async () => {
  const o = await seedOrder(w.db, w.B);
  await expectError(as(w.db, w.a, tx => tx.query(`select missing_photos($1, 'pickup')`, [o])), 'FORBIDDEN');
});

test('고객은 관제 배차 전용으로 접수하거나 바꿀 수 없다', async () => {
  await expectError(as(w.db, w.a, tx => tx.query(
    `insert into orders(company_id, pickup_address, dropoff_address, payment_method, fare, dispatch_mode)
     values ($1, '가', '나', 'postpaid', 1, 'staff_only')`, [w.A])), 'row-level security');
  const o = await seedOrder(w.db, w.A);
  await expectError(as(w.db, w.a, tx => tx.query(`update orders set dispatch_mode='staff_only' where id=$1`, [o])), 'FORBIDDEN');
});

test('고객은 접수자를 다른 사람으로 적을 수 없다', async () => {
  await expectError(as(w.db, w.a, tx => tx.query(
    `insert into orders(company_id, pickup_address, dropoff_address, payment_method, fare, created_by)
     values ($1, '가', '나', 'postpaid', 1, $2)`, [w.A, w.op])), 'row-level security');
});
