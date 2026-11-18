import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from '../supabase';
import { readBytes } from './image';
import { classifyError, storagePath, type QueueItem } from './queue';

type Err = { message?: string; statusCode?: string | number; code?: string } | null;

const isDuplicate = (e: Err) =>
  !!e && (e.code === '23505' || String(e.statusCode ?? '') === '409' || /duplicate|already exists/i.test(e.message ?? ''));

function fileGone(uri: string): boolean {
  if (Platform.OS === 'web') return false;
  try { return !new File(uri).exists; } catch { return true; }
}

/**
 * 대기열 한 장을 올린다: 저장소에 파일 → 표에 기록.
 * 같은 일을 두 번 해도 한 줄만 남게 만든다(칸 사진은 같은 경로 덮어쓰기 + upsert, 추가 사진·영수증은 미리 정한 id).
 */
/** 'denied'는 서버가 거부한 것 — 정말 버릴지는 부르는 쪽이 resolveDrop으로 다시 확인한다 */
export async function uploadOne(i: QueueItem): Promise<'ok' | 'retry' | 'drop' | 'denied'> {
  if (fileGone(i.localUri)) return 'drop';
  const { bucket, path } = storagePath(i);
  let body: ArrayBuffer;
  try { body = await readBytes(i.localUri); } catch { return 'drop'; }

  const up = await supabase.storage.from(bucket)
    .upload(path, body, { upsert: bucket === 'order-photos', contentType: 'image/jpeg' });
  if (up.error && !isDuplicate(up.error as Err)) return classifyError(up.error as Err) === 'drop' ? 'denied' : 'retry';

  let rowErr: Err = null;
  if (i.kind === 'receipt') {
    ({ error: rowErr } = await supabase.from('fuel_receipts').insert({ id: i.id, order_id: i.orderId, amount: i.amount, path }));
  } else if (i.slot) {
    ({ error: rowErr } = await supabase.from('order_photos').upsert(
      { order_id: i.orderId, phase: i.phase, slot: i.slot, path, taken_at: i.takenAt, lat: i.lat, lng: i.lng },
      { onConflict: 'order_id,phase,slot' }));
  } else {
    ({ error: rowErr } = await supabase.from('order_photos').insert(
      { id: i.id, order_id: i.orderId, phase: i.phase, slot: null, path, taken_at: i.takenAt, lat: i.lat, lng: i.lng }));
  }
  if (rowErr && !isDuplicate(rowErr)) return classifyError(rowErr) === 'drop' ? 'denied' : 'retry';
  return 'ok';
}

/** 다 올렸거나 포기한 사진의 휴대폰 파일 지우기 */
export function deleteLocal(uri: string) {
  if (Platform.OS === 'web') return;
  try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* 이미 없음 */ }
}
