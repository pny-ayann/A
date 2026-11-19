import type { REALTIME_SUBSCRIBE_STATES, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { readMark, subscribeAuthed, uniqueTopic } from '@takson/shared';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { kstShort } from '@/lib/time';
import { color, Notice } from '@/ui/kit';

type Message = { id: string; sender_id: string; body: string; created_at: string };
const COLS = 'id, sender_id, body, created_at';

/** 관제와 주고받는 이 오더의 '기사 문의' 대화. 실시간, 열어 두면 읽음 처리 */
export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const myId = profile?.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('messages').select(COLS)
        .eq('order_id', id).eq('thread', 'customer').order('created_at');
      if (alive && data) setMessages(data as Message[]);
    };
    const stop = subscribeAuthed(supabase, () => supabase.channel(uniqueTopic(`customer-chat-${id}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${id}` },
        (p: RealtimePostgresChangesPayload<Message & { thread: string }>) => {
          const m = p.new as Message & { thread: string };
          if (m.thread !== 'customer') return;
          setMessages(list => list.some(x => x.id === m.id) ? list : [...list, m]);
        })
      .subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => { if (status === 'SUBSCRIBED') void load(); }));
    void load();
    return () => { alive = false; stop(); };
  }, [id]);

  // 마지막으로 본 메시지의 서버 시각으로 읽음 처리 (관제 웹과 같은 규칙)
  const lastTime = messages.at(-1)?.created_at;
  useEffect(() => {
    const readAt = readMark(lastTime ? [lastTime] : []);
    if (!readAt || !myId) return;
    void supabase.from('thread_reads').upsert({ order_id: id, thread: 'customer', user_id: myId, read_at: readAt });
  }, [id, myId, lastTime]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const { data, error: e } = await supabase.from('messages')
      .insert({ order_id: id, thread: 'customer', body }).select(COLS).single();
    setSending(false);
    if (e || !data) { setError('보내지 못했어요. 신호를 확인하고 다시 보내 주세요.'); return; }
    setText('');
    setMessages(list => list.some(m => m.id === data.id) ? list : [...list, data as Message]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList ref={listRef} data={messages} keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Text style={{ fontSize: 16, color: color.sub, textAlign: 'center', marginTop: 40 }}>궁금한 점을 관제에 남겨 주세요.</Text>}
          renderItem={({ item }) => {
            const mine = item.sender_id === myId;
            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 2 }}>
                <Text style={{ fontSize: 13, color: color.sub }}>{mine ? '나' : '관제'} · {kstShort(item.created_at)}</Text>
                <Text style={{
                  maxWidth: '85%', fontSize: 18, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
                  color: mine ? '#fff' : color.text, backgroundColor: mine ? color.primary : '#fff',
                  borderWidth: mine ? 0 : 1, borderColor: color.line,
                }}>{item.body}</Text>
              </View>
            );
          }} />
        {error && <View style={{ paddingHorizontal: 16 }}><Notice tone="danger">{error}</Notice></View>}
        <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: color.line, backgroundColor: '#fff' }}>
          <TextInput accessibilityLabel="문의 내용" value={text} onChangeText={setText} placeholder="관제에 보낼 말" multiline
            placeholderTextColor="#9CA3AF"
            style={{ flex: 1, minHeight: 48, maxHeight: 120, fontSize: 18, borderWidth: 1, borderColor: color.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="보내기" onPress={() => void send()} disabled={sending || !text.trim()}
            style={{ justifyContent: 'center', paddingHorizontal: 18, borderRadius: 10, backgroundColor: color.primary, opacity: sending || !text.trim() ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>보내기</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
