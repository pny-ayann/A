import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const migrationsDir = join(here, '..', '..', 'migrations');

let template: Blob | File | undefined;

/** stub + 모든 마이그레이션이 적용된 새 DB. 처음 한 번 만든 뒤에는 복제해서 빠르게 준다. */
export async function createDb(): Promise<PGlite> {
  if (!template) {
    const db = new PGlite();
    await db.exec(readFileSync(join(here, 'stubs.sql'), 'utf8'));
    const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = readFileSync(join(migrationsDir, f), 'utf8');
      try {
        if (sql.trim()) await db.exec(sql);
      } catch (e) {
        throw new Error(`migration ${f} failed: ${(e as Error).message}`);
      }
    }
    template = await db.dumpDataDir('none');
    await db.close();
  }
  return new PGlite({ loadDataDir: template });
}

/** 로그인한 사용자(authenticated 역할)로 fn을 실행한다. */
export async function as<T>(db: PGlite, userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    return fn(tx);
  });
}

/** 오류 메시지에 code가 들어 있어야 통과 */
export async function expectError(p: Promise<unknown>, code: string): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  if (!err) throw new Error(`expected error containing "${code}" but call succeeded`);
  const msg = (err as Error).message ?? String(err);
  if (!msg.includes(code)) throw new Error(`expected error containing "${code}" but got: ${msg}`);
}

export type UserOpts = {
  loginId: string;
  role?: 'driver' | 'customer' | 'staff';
  companyId?: string;
  staffLevel?: 'admin' | 'operator';
  driverStatus?: 'pending' | 'active' | 'suspended';
  name?: string;
  phone?: string;
  selfSignup?: boolean;
};

let seq = 0;
const next = () => ++seq;

/** auth.users에 행을 넣어 프로필을 만들고 user id를 돌려준다. */
export async function createUser(db: PGlite, o: UserOpts): Promise<string> {
  const email = `${o.loginId}@takson.local`;
  const meta = {
    role: o.role ?? 'driver',
    company_id: o.companyId ?? null,
    staff_level: o.staffLevel ?? null,
    name: o.name ?? o.loginId,
    phone: o.phone ?? `010-0000-${String(next()).padStart(4, '0')}`,
  };
  const app = o.selfSignup ? {} : meta;
  const user = o.selfSignup ? meta : { name: meta.name, phone: meta.phone };
  const r = await db.query<{ id: string }>(
    'insert into auth.users(email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3) returning id',
    [email, JSON.stringify(app), JSON.stringify(user)]);
  const id = r.rows[0]!.id;
  if (o.driverStatus) await db.query('update profiles set driver_status=$2 where id=$1', [id, o.driverStatus]);
  return id;
}

export async function seedCompany(
  db: PGlite,
  o: { name?: string; defaultPayment?: 'cash' | 'postpaid'; fuelBilling?: 'customer' | 'company' } = {},
): Promise<string> {
  const r = await db.query<{ id: string }>(
    'insert into companies(name, default_payment, fuel_billing) values ($1, $2, $3) returning id',
    [o.name ?? `상사${next()}`, o.defaultPayment ?? 'postpaid', o.fuelBilling ?? 'customer']);
  return r.rows[0]!.id;
}

export const ORDER_DEFAULTS = {
  kind: 'takson', status: 'open', dispatch_mode: 'open', payment_method: 'postpaid', fare: 50000,
  pickup_address: '서울 중구 세종대로 110', pickup_area: '중구 태평로1가', pickup_lat: 37.5665, pickup_lng: 126.978,
  pickup_contact_name: '김출발', pickup_contact_phone: '010-1111-1111',
  dropoff_address: '서울 강남구 강남대로 396', dropoff_area: '강남구 역삼동', dropoff_lat: 37.4979, dropoff_lng: 127.0276,
  dropoff_contact_name: '이도착', dropoff_contact_phone: '010-2222-2222',
  vehicle_number: '12가3456', vehicle_model: '쏘나타',
};

/** 슈퍼유저로 오더를 넣는다. o의 키는 orders 컬럼 이름. */
export async function seedOrder(db: PGlite, companyId: string, o: Record<string, unknown> = {}): Promise<string> {
  const row: Record<string, unknown> = { ...ORDER_DEFAULTS, ...o, company_id: companyId };
  const cols = Object.keys(row);
  const r = await db.query<{ id: string }>(
    `insert into orders(${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id`,
    cols.map(c => row[c]));
  return r.rows[0]!.id;
}

export const SLOTS = ['front', 'back', 'left', 'right', 'dashboard'];

export async function seedPhotos(
  db: PGlite, orderId: string, phase: 'pickup' | 'dropoff', slots: string[] = SLOTS,
): Promise<void> {
  for (const s of slots) {
    await db.query('insert into order_photos(order_id, phase, slot, path) values ($1, $2, $3, $4)',
      [orderId, phase, s, `${orderId}/${phase}/${s}.jpg`]);
  }
}

/** 업체 A, B / 고객 a(A), b(B) / 관리자 admin / 일반 관제 op / 승인된 기사 d, d2 / 대기 중 기사 dp */
export async function createWorld() {
  const db = await createDb();
  const A = await seedCompany(db, { name: '상사A' });
  const B = await seedCompany(db, { name: '상사B' });
  const a = await createUser(db, { loginId: 'cust_a', role: 'customer', companyId: A });
  const b = await createUser(db, { loginId: 'cust_b', role: 'customer', companyId: B });
  const admin = await createUser(db, { loginId: 'admin1', role: 'staff', staffLevel: 'admin' });
  const op = await createUser(db, { loginId: 'op1', role: 'staff', staffLevel: 'operator' });
  const d = await createUser(db, { loginId: 'driver1', role: 'driver', driverStatus: 'active', name: '김기사' });
  const d2 = await createUser(db, { loginId: 'driver2', role: 'driver', driverStatus: 'active', name: '박기사' });
  const dp = await createUser(db, { loginId: 'driver3', role: 'driver', driverStatus: 'pending' });
  return { db, A, B, a, b, admin, op, d, d2, dp };
}
