import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { photoGrid, SLOT_LABEL, type PhotoRow } from '@/lib/orders/photos';
import { supabase } from '@/lib/supabase';
import { kstShort, won } from '@/lib/time';
import { Body, Card, color, Screen, Title } from '@/ui/kit';

type Receipt = { id: string; amount: number; path: string; created_at: string };

function Thumb({ label, url, sub, onOpen }: { label: string; url: string | null; sub?: string; onOpen: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={!url} onPress={onOpen}
      style={{ width: '31%', gap: 4 }}>
      {url
        ? <Image source={{ uri: url }} style={{ width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: color.line }} />
        : <View style={{ width: '100%', aspectRatio: 1, borderRadius: 8, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: color.sub, fontSize: 14 }}>없음</Text>
          </View>}
      <Text style={{ fontSize: 14, color: color.text }}>{label}</Text>
      {sub ? <Text style={{ fontSize: 12, color: color.sub }}>{sub}</Text> : null}
    </Pressable>
  );
}

/** 출발·도착·추가 사진과 주유 영수증 보기 (고객은 보기만) */
export default function Photos() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [rows, setRows] = useState<PhotoRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [receipts, setReceipts] = useState<(Receipt & { url: string | null })[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    void (async () => {
      const [p, r] = await Promise.all([
        supabase.from('order_photos').select('id, phase, slot, path, taken_at').eq('order_id', id),
        supabase.from('fuel_receipts').select('id, amount, path, created_at').eq('order_id', id).order('created_at'),
      ]);
      const photos = (p.data ?? []) as PhotoRow[];
      setRows(photos);
      if (photos.length) {
        const s = await supabase.storage.from('order-photos').createSignedUrls(photos.map(x => x.path), 3600);
        const map: Record<string, string> = {};
        (s.data ?? []).forEach((x, i) => { if (x.signedUrl) map[photos[i]!.path] = x.signedUrl; });
        setUrls(map);
      }
      const recs = (r.data ?? []) as Receipt[];
      if (recs.length) {
        const s = await supabase.storage.from('receipts').createSignedUrls(recs.map(x => x.path), 3600);
        setReceipts(recs.map((x, i) => ({ ...x, url: s.data?.[i]?.signedUrl ?? null })));
      } else {
        setReceipts([]);
      }
    })();
  }, [id]));

  const g = photoGrid(rows);
  const grid = (list: (PhotoRow | null)[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {list.map((x, i) => {
        const slot = (['front', 'back', 'left', 'right', 'dashboard'] as const)[i]!;
        const url = x ? urls[x.path] ?? null : null;
        return <Thumb key={slot} label={SLOT_LABEL[slot]} url={url} sub={x ? kstShort(x.taken_at) : undefined} onOpen={() => setOpen(url)} />;
      })}
    </View>
  );

  return (
    <Screen>
      <Title>출발 사진</Title>
      {grid(g.pickup)}
      <Title>도착 사진</Title>
      {grid(g.dropoff)}
      {g.extra.length > 0 && (
        <>
          <Title>추가 사진 (흠집 등)</Title>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {g.extra.map(x => <Thumb key={x.id} label="추가" url={urls[x.path] ?? null} sub={kstShort(x.taken_at)} onOpen={() => setOpen(urls[x.path] ?? null)} />)}
          </View>
        </>
      )}
      {receipts.length > 0 && (
        <Card>
          <Text style={{ fontSize: 17, fontWeight: '700' }}>주유비 {won(receipts.reduce((s, r) => s + r.amount, 0))}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {receipts.map(r => <Thumb key={r.id} label={won(r.amount)} url={r.url} sub={kstShort(r.created_at)} onOpen={() => setOpen(r.url)} />)}
          </View>
        </Card>
      )}
      {rows.length === 0 && receipts.length === 0 && <Body sub>아직 사진이 없어요. 기사님이 찍으면 여기에 보여요.</Body>}

      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => setOpen(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center' }}>
          {open && <Image source={{ uri: open }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />}
          <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, marginTop: 12 }}>눌러서 닫기</Text>
        </Pressable>
      </Modal>
    </Screen>
  );
}
