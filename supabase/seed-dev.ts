// 개발용 계정·업체·요금표·미션을 만든다. 여러 번 실행해도 안전하다(이미 있으면 건너뜀).
// 실행: npm run seed:dev   (apps/admin/.env.local 의 값을 읽는다)
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEV_PASSWORD;
if (!url || !serviceKey || !password) {
  console.error('apps/admin/.env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEV_PASSWORD 가 필요해요.');
  process.exit(1);
}
if (password.length < 8) {
  console.error('DEV_PASSWORD 는 8자 이상이어야 해요.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const email = (id: string) => `${id}@takson.local`;

async function ensureCompany(name: string): Promise<string> {
  const found = await admin.from('companies').select('id').eq('name', name).maybeSingle();
  if (found.error) throw found.error;
  if (found.data) return found.data.id as string;
  const made = await admin.from('companies').insert({ name, default_payment: 'postpaid', fuel_billing: 'customer' })
    .select('id').single();
  if (made.error) throw made.error;
  return made.data.id as string;
}

async function ensureUser(loginId: string, meta: Record<string, unknown>): Promise<void> {
  const r = await admin.auth.admin.createUser({
    email: email(loginId), password, email_confirm: true, app_metadata: meta,
  });
  if (r.error && !/already/i.test(r.error.message)) throw r.error;
}

async function main() {
  const A = await ensureCompany('개발상사A');
  const B = await ensureCompany('개발상사B');

  await ensureUser('dev_admin', { role: 'staff', staff_level: 'admin', name: '개발관리자', phone: '010-0000-0001' });
  await ensureUser('dev_op', { role: 'staff', staff_level: 'operator', name: '개발관제', phone: '010-0000-0002' });
  await ensureUser('dev_cust_a', { role: 'customer', company_id: A, name: '상사A담당', phone: '010-0000-0003' });
  await ensureUser('dev_cust_b', { role: 'customer', company_id: B, name: '상사B담당', phone: '010-0000-0004' });
  await ensureUser('dev_driver1', { role: 'driver', driver_status: 'active', name: '김기사', phone: '010-0000-0005' });
  await ensureUser('dev_driver2', { role: 'driver', driver_status: 'active', name: '박기사', phone: '010-0000-0006' });

  const bands = await admin.from('fare_bands').select('id').limit(1);
  if (bands.error) throw bands.error;
  if (bands.data.length === 0) {
    const r = await admin.from('fare_bands').insert([
      { max_km: 10, fare: 20000 }, { max_km: 30, fare: 35000 }, { max_km: 50, fare: 50000 },
    ]);
    if (r.error) throw r.error;
  }

  for (const m of [{ name: '세차', extra_fare: 10000 }, { name: '주유대행', extra_fare: 5000 }]) {
    const f = await admin.from('missions').select('id').eq('name', m.name).maybeSingle();
    if (f.error) throw f.error;
    if (!f.data) {
      const r = await admin.from('missions').insert(m);
      if (r.error) throw r.error;
    }
  }

  const counts = await Promise.all(['profiles', 'companies', 'fare_bands', 'missions']
    .map(t => admin.from(t).select('*', { count: 'exact', head: true }).then(r => r.count ?? 0)));
  console.log(`계정 ${counts[0]}, 업체 ${counts[1]}, 요금 ${counts[2]}, 미션 ${counts[3]} 준비됨`);
}

main().catch(e => { console.error('실패:', e.message ?? e); process.exit(1); });
