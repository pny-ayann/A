import { expect, test } from 'vitest';
import { subscribeAuthed, type RealtimeClientLike } from './realtime';

function fake(token: string | null) {
  const log: string[] = [];
  const client: RealtimeClientLike = {
    auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) },
    realtime: { setAuth: async (t?: string | null) => { log.push(`setAuth:${t}`); } },
    removeChannel: async () => { log.push('remove'); return 'ok'; },
  };
  return { client, log };
}
const tick = () => new Promise(r => setTimeout(r, 0));

test('구독 전에 로그인 토큰을 실시간 연결에 붙인다', async () => {
  const { client, log } = fake('tok');
  subscribeAuthed(client, () => { log.push('subscribe'); return {} as never; });
  await tick();
  expect(log).toEqual(['setAuth:tok', 'subscribe']);
});

test('로그인이 없으면 구독하지 않는다 (anon 구독이 남의 실시간까지 막으므로)', async () => {
  const { client, log } = fake(null);
  subscribeAuthed(client, () => { log.push('subscribe'); return {} as never; });
  await tick();
  expect(log).toEqual([]);
});

test('준비 전에 정리되면 구독하지 않고, 구독 뒤 정리되면 채널을 지운다', async () => {
  const a = fake('tok');
  const stopA = subscribeAuthed(a.client, () => { a.log.push('subscribe'); return {} as never; });
  stopA();
  await tick();
  expect(a.log).not.toContain('subscribe');

  const b = fake('tok');
  const stopB = subscribeAuthed(b.client, () => { b.log.push('subscribe'); return {} as never; });
  await tick();
  stopB();
  expect(b.log).toEqual(['setAuth:tok', 'subscribe', 'remove']);
});
