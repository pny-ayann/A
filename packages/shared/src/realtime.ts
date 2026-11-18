import type { RealtimeChannel } from '@supabase/supabase-js';

/** subscribeAuthed가 쓰는 Supabase 클라이언트의 일부 */
export type RealtimeClientLike = {
  auth: { getSession: () => Promise<{ data: { session: { access_token: string } | null } }> };
  realtime: { setAuth: (token?: string | null) => Promise<void> | void };
  removeChannel: (ch: RealtimeChannel) => Promise<unknown>;
};

/**
 * 로그인 토큰을 실시간 연결에 붙인 뒤에 구독한다. 정리 함수를 돌려준다.
 * 토큰 없이(anon) 구독하면 서버의 권한 검사가 실패하고, 그 실패가 같은 변경을 기다리던
 * 다른 사람의 실시간 전달까지 막는다. 그래서 로그인이 없으면 아예 구독하지 않는다.
 */
export function subscribeAuthed(client: RealtimeClientLike, build: () => RealtimeChannel): () => void {
  let stopped = false;
  let channel: RealtimeChannel | null = null;
  void (async () => {
    const { data } = await client.auth.getSession();
    if (stopped || !data.session) return;
    await client.realtime.setAuth(data.session.access_token);
    if (stopped) return;
    channel = build();
  })();
  return () => {
    stopped = true;
    if (channel) void client.removeChannel(channel);
  };
}

let topicSeq = 0;
/**
 * 화면마다 다른 실시간 채널 이름. 같은 이름을 두 화면이 쓰면 supabase가 같은 채널을 돌려줘서
 * 두 번째 화면이 이미 구독된 채널에 콜백을 붙이다 오류가 난다(오더 화면 위에 주유 화면을 열 때).
 */
export function uniqueTopic(base: string): string {
  return `${base}-${++topicSeq}`;
}
