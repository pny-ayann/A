import { as, createWorld, expectError, seedCompany, createUser, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

const put = (user: string, bucket: string, name: string) =>
  as(w.db, user, tx => tx.query('insert into storage.objects(bucket_id, name, owner) values ($1, $2, $3)', [bucket, name, user]));
const list = async (user: string, bucket: string) =>
  (await as(w.db, user, tx => tx.query<{ name: string }>('select name from storage.objects where bucket_id=$1', [bucket]))).rows.map(r => r.name);

test('버킷 3개가 비공개로 만들어진다', async () => {
  const r = await w.db.query('select id, public from storage.buckets order by id');
  expect(r.rows).toEqual([
    { id: 'driver-docs', public: false },
    { id: 'order-photos', public: false },
    { id: 'receipts', public: false },
  ]);
});

test('배정 기사는 자기 오더 폴더에 사진을 올리고, 다른 기사는 못 올린다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'arrived_pickup', driver_id: w.d });
  await put(w.d, 'order-photos', `${o}/pickup/front.jpg`);
  await expectError(put(w.d2, 'order-photos', `${o}/pickup/back.jpg`), 'row-level security');
});

test('완료된 오더에는 기사가 사진을 더 올릴 수 없다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'completed', driver_id: w.d });
  await expectError(put(w.d, 'order-photos', `${o}/extra/1.jpg`), 'row-level security');
});

test('고객 a는 자기 오더 사진 파일을 보고, 업체 B 오더 사진 파일은 못 본다', async () => {
  const oa = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
  const ob = await seedOrder(w.db, w.B, { status: 'driving', driver_id: w.d2 });
  await put(w.d, 'order-photos', `${oa}/dropoff/front.jpg`);
  await put(w.d2, 'order-photos', `${ob}/dropoff/front.jpg`);
  expect(await list(w.a, 'order-photos')).toEqual([`${oa}/dropoff/front.jpg`]);
  expect(await list(w.op, 'order-photos')).toHaveLength(2);
});

test('폴더 이름이 오더 id가 아니면 거부한다', async () => {
  await expectError(put(w.d, 'order-photos', 'not-a-uuid/pickup/front.jpg'), 'row-level security');
});

test('회사 부담 업체 고객은 영수증 파일을 못 본다', async () => {
  const C = await seedCompany(w.db, { fuelBilling: 'company' });
  const c = await createUser(w.db, { loginId: 'cust_c', role: 'customer', companyId: C });
  const oc = await seedOrder(w.db, C, { status: 'driving', driver_id: w.d });
  await put(w.d, 'receipts', `${oc}/r1.jpg`);
  expect(await list(c, 'receipts')).toHaveLength(0);
  expect(await list(w.d, 'receipts')).toHaveLength(1);
});

test('기사는 자기 서류 폴더에만 올리고 남의 서류는 못 본다', async () => {
  await put(w.dp, 'driver-docs', `${w.dp}/license.jpg`);
  await expectError(put(w.dp, 'driver-docs', `${w.d}/license.jpg`), 'row-level security');
  expect(await list(w.d, 'driver-docs')).toHaveLength(0);
  expect(await list(w.op, 'driver-docs')).toHaveLength(1);
});
