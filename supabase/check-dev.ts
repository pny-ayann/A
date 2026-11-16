// 실제 서버에서 권한 규칙이 동작하는지 간단히 확인한다 (서비스 키를 쓰지 않음).
// 실행: npm run check:dev
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = process.env.DEV_PASSWORD!;

const client = createClient(url, anon, { auth: { persistSession: false } });
const login = await client.auth.signInWithPassword({ email: 'dev_cust_a@takson.local', password });
if (login.error) { console.error('로그인 실패:', login.error.message); process.exit(1); }
const r = await client.from('companies').select('name');
if (r.error) { console.error('조회 실패:', r.error.message); process.exit(1); }
console.log(JSON.stringify(r.data.map(x => x.name)));
