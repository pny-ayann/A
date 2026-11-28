/**
 * 일회용: 예시서류/<회사 폴더>/*.jpg → capital_companies + capital-examples 버킷 + capital_examples.
 * 실행(저장소 맨 위에서, 허락 받은 뒤):  node --env-file=apps/admin/.env.local scripts/upload-capital-examples.ts
 * - 폴더 이름 앞 '#[마]', 뒤 '_1_2'·'_2' 는 떼고 회사 이름으로 쓴다. 같은 이름 회사가 이미 있으면 빠진 번호의 사진만 올린다.
 * - 사진은 긴 변 1600px 이하 JPEG로 줄여 올린다. 순서는 파일 이름 순. 표지 표시는 관제웹에서 한다.
 * - 결과는 회사 수·사진 수만 출력한다(비밀값·파일 내용은 출력하지 않음).
 */
import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = '예시서류';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

export const companyName = (folder: string) => folder.replace(/^#\[[^\]]*\]/, '').replace(/(_\d+)+$/, '').trim();

let companies = 0, photos = 0, skipped = 0;
const folders = readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
for (const [i, folder] of folders.entries()) {
  const name = companyName(folder);
  const found = await db.from('capital_companies').select('id, capital_examples(seq)').eq('name', name).maybeSingle();
  // 이미 있는 회사는 빠진 사진만 이어서 올린다 (중간에 멈췄을 때 다시 실행 가능)
  const done = new Set<number>((found.data?.capital_examples ?? []).map((e: { seq: number }) => e.seq));
  let c = found.data ? { data: { id: found.data.id as string }, error: null } : await db.from('capital_companies').insert({ name, sort: i }).select('id').single();
  if (c.error) throw new Error(`회사 '${name}' 만들기 실패: ${c.error.message}`);
  if (found.data) skipped++; else companies++;
  const files = readdirSync(join(ROOT, folder)).filter(f => /\.(jpe?g|png)$/i.test(f)).sort();
  for (const [n, f] of files.entries()) {
    if (done.has(n + 1)) continue;
    // failOn 'none': 휴대폰 사진 중 조금 깨진 JPEG도 읽는다
    const body = await sharp(readFileSync(join(ROOT, folder, f)), { failOn: 'none' })
      .rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const path = `${c.data.id}/${n + 1}.jpg`;
    const up = await db.storage.from('capital-examples').upload(path, body, { contentType: 'image/jpeg', upsert: true });
    if (up.error) throw new Error(`'${name}' ${n + 1}번 사진 올리기 실패: ${up.error.message}`);
    const r = await db.from('capital_examples').insert({ company_id: c.data.id, seq: n + 1, title: `양식 ${n + 1}`, path });
    if (r.error) throw new Error(`'${name}' ${n + 1}번 행 실패: ${r.error.message}`);
    photos++;
  }
}
console.log(`회사 ${companies}곳, 사진 ${photos}장 올림 (이미 있던 회사 ${skipped}곳은 빠진 사진만)`);
