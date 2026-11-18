import { supabase } from '../supabase';
import { compressPhoto, readBytes } from '../photos/image';

export type DocKind = 'license' | 'insurance';
export const DOC_LABEL: Record<DocKind, string> = { license: '운전면허증', insurance: '보험 서류' };

/** 내가 올린 서류 종류 */
export async function myDocuments(driverId: string): Promise<DocKind[]> {
  const { data } = await supabase.from('driver_documents').select('kind').eq('driver_id', driverId);
  return [...new Set((data ?? []).map(r => r.kind as DocKind))];
}

/** 서류 사진을 압축해서 driver-docs/<내 id>/<종류>.jpg 에 올리고 기록한다. 다시 찍으면 파일만 바꾼다. */
export async function uploadDocument(driverId: string, kind: DocKind, uri: string, size: { width: number; height: number }): Promise<string | null> {
  const small = await compressPhoto(uri, size.width, size.height);
  const path = `${driverId}/${kind}.jpg`;
  const { error } = await supabase.storage.from('driver-docs')
    .upload(path, await readBytes(small), { upsert: true, contentType: 'image/jpeg' });
  if (error) return '사진을 올리지 못했어요. 신호를 확인하고 다시 찍어 주세요.';
  const have = await myDocuments(driverId);
  if (!have.includes(kind)) {
    const { error: e2 } = await supabase.from('driver_documents').insert({ driver_id: driverId, kind, path });
    if (e2) return '서류 기록을 남기지 못했어요. 다시 시도해 주세요.';
  }
  return null;
}
