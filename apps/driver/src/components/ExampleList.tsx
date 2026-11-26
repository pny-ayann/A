import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { Example } from '@/lib/orders/useOrder';
import { supabase } from '@/lib/supabase';
import { Body, color } from '@/ui/kit';

/** 캐피탈 회사 하나의 작성 예시 사진들(순서대로). 누르면 크게 */
export function ExampleList({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<(Example & { url: string | null })[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.from('capital_examples').select('id, seq, title, path, is_cover').eq('company_id', companyId).order('seq');
      const ex = (data ?? []) as Example[];
      const s = ex.length ? await supabase.storage.from('capital-examples').createSignedUrls(ex.map(e => e.path), 3600) : { data: [] };
      if (alive) setRows(ex.map((e, i) => ({ ...e, url: s.data?.[i]?.signedUrl ?? null })));
    })();
    return () => { alive = false; };
  }, [companyId]);

  if (rows === null) return <Body sub>불러오는 중…</Body>;
  if (rows.length === 0) return <Body sub>이 회사는 아직 예시가 없어요. 관제에 물어봐 주세요.</Body>;
  return (
    <View style={{ gap: 16 }}>
      {rows.map(e => (
        <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`${e.title} 크게 보기`}
          disabled={!e.url} onPress={() => setOpen(e.url)} style={{ gap: 6 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: color.text }}>{e.title}{e.is_cover ? ' (표지)' : ''}</Text>
          {e.url
            ? <Image source={{ uri: e.url }} resizeMode="contain"
                style={{ width: '100%', aspectRatio: 0.7, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: color.line }} />
            : <Body sub>사진을 불러오지 못했어요.</Body>}
        </Pressable>
      ))}
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => setOpen(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}>
          <ScrollView maximumZoomScale={4} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            {!!open && <Image source={{ uri: open }} style={{ width: '100%', height: 640 }} resizeMode="contain" />}
          </ScrollView>
          <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, padding: 12 }}>눌러서 닫기</Text>
        </Pressable>
      </Modal>
    </View>
  );
}
