// 화면 확인용: 테스트 고객(dev_cust_a)으로 로그인해 자기 업체의 가장 최근 오더에 고객 문의 1개를 보낸다.
// 서비스 키를 쓰지 않으므로 권한 규칙(RLS)을 그대로 거친다.
// 실행: npm run dev:message -- "보낼 말"
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = process.env.DEV_PASSWORD!;
const body = process.argv[2] ?? '기사님 언제 도착하나요?';

const client = createClient(url, anon, { auth: { persistSession: false } });
const login = await client.auth.signInWithPassword({ email: 'dev_cust_a@takson.local', password });
if (login.error) { console.error('로그인 실패:', login.error.message); process.exit(1); }

const order = await client.from('orders').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle();
if (order.error || !order.data) { console.error('오더를 찾지 못했어요.'); process.exit(1); }

const sent = await client.from('messages').insert({ order_id: order.data.id, thread: 'customer', body });
if (sent.error) { console.error('보내지 못했어요:', sent.error.message); process.exit(1); }
console.log(`오더 ${order.data.id} 에 고객 문의를 보냈어요.`);
