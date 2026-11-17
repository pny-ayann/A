'use client';
import type { REALTIME_SUBSCRIBE_STATES, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { readMark, THREAD_LABEL, UNREAD_CHANGED, unreadFor, type Thread } from '@/lib/chat/unread';
import { useUnread } from '@/lib/chat/useUnread';
import { browserClient } from '@/lib/supabase/browser';
import { subscribeAuthed } from '@/lib/supabase/realtime';

type Message = { id: string; order_id: string; thread: Thread; sender_id: string; body: string; created_at: string };
type Person = { name: string; role: string };

const kst = (iso: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(iso));
const ROLE_LABEL: Record<string, string> = { staff: '관제', customer: '고객', driver: '기사' };

/** 오더 상세 오른쪽: 고객 문의 / 기사 문의 탭. 실시간, 탭을 보면 읽음 처리 */
export function ChatPanel({ orderId, myId }: { orderId: string; myId: string }) {
  const [thread, setThread] = useState<Thread>('customer');
  const [messages, setMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const unread = useUnread();
  const bottom = useRef<HTMLDivElement>(null);

  // 이 오더의 메시지 전체를 받고 새 메시지를 실시간으로 붙인다
  useEffect(() => {
    const supabase = browserClient();
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('messages').select('id, order_id, thread, sender_id, body, created_at')
        .eq('order_id', orderId).order('created_at');
      if (alive && data) setMessages(data as Message[]);
    };
    const stop = subscribeAuthed(supabase, () => supabase.channel(`chat-${orderId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` },
        (p: RealtimePostgresChangesPayload<Message>) => setMessages(list => list.some(m => m.id === (p.new as Message).id) ? list : [...list, p.new as Message]))
      .subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => { if (status === 'SUBSCRIBED') void load(); }));
    void load();
    return () => { alive = false; stop(); };
  }, [orderId]);

  // 처음 보는 사람 이름 불러오기
  useEffect(() => {
    const missing = [...new Set(messages.map(m => m.sender_id))].filter(id => !people.has(id));
    if (!missing.length) return;
    void browserClient().from('profiles').select('id, name, login_id, role').in('id', missing).then(({ data }: { data: { id: string; name: string | null; login_id: string; role: string }[] | null }) => {
      if (!data) return;
      setPeople(cur => {
        const next = new Map(cur);
        data.forEach((p: { id: string; name: string | null; login_id: string; role: string }) => next.set(p.id, { name: p.name ?? p.login_id, role: p.role }));
        return next;
      });
    });
  }, [messages, people]);

  const shown = messages.filter(m => m.thread === thread);
  const lastShown = shown.at(-1)?.id;
  const lastTime = shown.at(-1)?.created_at;

  // 보고 있는 탭은 읽음 처리 (새 메시지가 와도 다시)
  useEffect(() => {
    let alive = true;
    void browserClient().from('thread_reads')
      .upsert({ order_id: orderId, thread, user_id: myId, read_at: readMark(lastTime ? [lastTime] : [], new Date()) })
      .then(() => { if (alive) window.dispatchEvent(new Event(UNREAD_CHANGED)); });
    return () => { alive = false; };
  }, [orderId, thread, myId, lastTime]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [lastShown]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    const { data, error: e } = await browserClient().from('messages')
      .insert({ order_id: orderId, thread, body }).select('id, order_id, thread, sender_id, body, created_at').single();
    setSending(false);
    if (e || !data) { setError('보내지 못했어요. 잠시 뒤 다시 해 주세요.'); return; }
    setText('');
    setMessages(list => list.some(m => m.id === data.id) ? list : [...list, data as Message]);
  }

  return (
    <section className="flex h-[32rem] flex-col rounded border bg-white">
      <div className="flex border-b text-sm" role="tablist">
        {(['customer', 'driver'] as const).map(t => {
          const n = t === thread ? 0 : unreadFor(unread, orderId, t);
          return (
            <button key={t} type="button" role="tab" aria-selected={t === thread} onClick={() => setThread(t)}
              className={`flex-1 px-3 py-2 ${t === thread ? 'border-b-2 border-blue-600 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}>
              {THREAD_LABEL[t]}
              {n > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {shown.length === 0 && <p className="text-center text-slate-400">아직 문의가 없어요.</p>}
        {shown.map(m => {
          const mine = m.sender_id === myId;
          const who = people.get(m.sender_id);
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <span className="text-xs text-slate-400">
                {who ? `${ROLE_LABEL[who.role] ?? ''} ${who.name}` : ''} · {kst(m.created_at)}
              </span>
              <span className={`max-w-[85%] rounded-lg px-3 py-1.5 whitespace-pre-wrap ${mine ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>{m.body}</span>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <div className="flex gap-2 border-t p-2">
        <textarea aria-label="문의 답장" value={text} rows={2} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
          placeholder={`${THREAD_LABEL[thread]}에 답장 (Enter 보내기, Shift+Enter 줄바꿈)`}
          className="min-w-0 flex-1 resize-none rounded border px-2 py-1 text-sm" />
        <button type="button" onClick={() => void send()} disabled={sending || !text.trim()}
          className="rounded bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-50">보내기</button>
      </div>
      {error && <p role="alert" className="px-3 pb-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
