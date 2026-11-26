'use client';
import { errorMessage } from '@takson/shared';
import { useCallback, useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';

type Company = { id: string; name: string; active: boolean; sort: number };
type Example = { id: string; company_id: string; seq: number; title: string; path: string; is_cover: boolean };

const input = 'rounded border px-2 py-1 text-sm';
const BUCKET = 'capital-examples';

/** 회사 추가·숨김, 회사별 예시 올리기·이름·순서·표지·지우기 (권한은 서버 규칙이 관리자만 허용) */
export function CapitalManager() {
  const supabase = browserClient();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCompanies = useCallback(async () => {
    const { data } = await supabase.from('capital_companies').select('id, name, active, sort').order('sort').order('name');
    setCompanies((data ?? []) as Company[]);
  }, [supabase]);

  const loadExamples = useCallback(async (companyId: string) => {
    const { data } = await supabase.from('capital_examples').select('*').eq('company_id', companyId).order('seq');
    const rows = (data ?? []) as Example[];
    setExamples(rows);
    if (rows.length) {
      const s = await supabase.storage.from(BUCKET).createSignedUrls(rows.map(r => r.path), 3600);
      const signed = (s.data ?? []) as { path: string | null; signedUrl: string }[];
      setUrls(Object.fromEntries(signed.filter(x => x.signedUrl && x.path).map(x => [x.path!, x.signedUrl])));
    }
  }, [supabase]);

  useEffect(() => { void loadCompanies(); }, [loadCompanies]);
  useEffect(() => { if (open) void loadExamples(open); else setExamples([]); }, [open, loadExamples]);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, after: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setMsg(errorMessage(error.message)); return; }
    await after();
  }

  const addCompany = () => run(
    () => supabase.from('capital_companies').insert({ name: name.trim(), sort: companies.length }),
    async () => { setName(''); await loadCompanies(); });
  const toggleActive = (c: Company) => run(
    () => supabase.from('capital_companies').update({ active: !c.active }).eq('id', c.id), loadCompanies);
  const patchExample = (e: Example, v: Partial<Example>) => run(
    () => supabase.from('capital_examples').update(v).eq('id', e.id), () => loadExamples(e.company_id));
  const removeExample = (e: Example) => {
    if (!confirm(`'${e.title}' 예시를 지울까요? 기사님이 이미 올린 이 칸 서류는 남지만 더 요구하지 않아요.`)) return;
    void run(async () => {
      const r = await supabase.from('capital_examples').delete().eq('id', e.id);
      if (!r.error) await supabase.storage.from(BUCKET).remove([e.path]);
      return r;
    }, () => loadExamples(e.company_id));
  };
  // 위·아래: 이웃과 순서 번호를 맞바꾼다
  const move = (i: number, d: -1 | 1) => {
    const a = examples[i], b = examples[i + d];
    if (!a || !b) return;
    void run(async () => {
      const r = await supabase.from('capital_examples').update({ seq: b.seq }).eq('id', a.id);
      return r.error ? r : supabase.from('capital_examples').update({ seq: a.seq }).eq('id', b.id);
    }, () => loadExamples(a.company_id));
  };
  async function upload(companyId: string, files: FileList | null) {
    if (!files?.length) return;
    let seq = examples.reduce((m, e) => Math.max(m, e.seq), 0);
    for (const f of Array.from(files)) {
      const path = `${companyId}/${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'image/jpeg' });
      if (up.error) { setMsg(errorMessage(up.error.message)); break; }
      const title = f.name.replace(/\.[^.]+$/, '');
      const r = await supabase.from('capital_examples').insert({ company_id: companyId, seq: ++seq, title, path });
      if (r.error) { setMsg(errorMessage(r.error.message)); break; }
    }
    await loadExamples(companyId);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input aria-label="캐피탈 회사 이름" placeholder="새 캐피탈 회사 (예: KB할부)" value={name}
          onChange={e => setName(e.target.value)} className={`${input} w-64`} />
        <button type="button" disabled={busy || !name.trim()} onClick={() => void addCompany()}
          className="rounded bg-road px-3 py-1 text-sm text-white disabled:opacity-40">추가</button>
      </div>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <ul className="divide-y rounded border bg-white">
        {companies.map(c => (
          <li key={c.id} className="p-2">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className="font-medium hover:underline">
                {open === c.id ? '▾' : '▸'} {c.name}
              </button>
              {!c.active && <span className="rounded bg-slate-200 px-1 text-xs">숨김</span>}
              <button type="button" disabled={busy} onClick={() => void toggleActive(c)}
                className="ml-auto rounded border px-2 py-0.5 text-xs hover:bg-slate-50">{c.active ? '숨기기' : '다시 보이기'}</button>
            </div>
            {open === c.id && (
              <div className="mt-2 space-y-2">
                <label className="inline-block cursor-pointer rounded border px-2 py-1 text-xs hover:bg-slate-50">
                  예시 사진 올리기
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { void upload(c.id, e.target.files); e.target.value = ''; }} />
                </label>
                {examples.length === 0 && <p className="text-xs text-slate-500">아직 예시가 없어요.</p>}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {examples.map((e, i) => (
                    <figure key={e.id} className="space-y-1 rounded border p-1">
                      {urls[e.path]
                        // eslint-disable-next-line @next/next/no-img-element -- 서명 URL
                        ? <a href={urls[e.path]} target="_blank" rel="noreferrer"><img src={urls[e.path]} alt={e.title} className="h-40 w-full object-contain bg-slate-50" /></a>
                        : <div className="h-40 bg-slate-100" />}
                      <input aria-label="예시 이름" defaultValue={e.title} className={`${input} w-full text-xs`}
                        onBlur={ev => { const t = ev.target.value.trim(); if (t && t !== e.title) void patchExample(e, { title: t }); }} />
                      <div className="flex items-center gap-1 text-xs">
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={e.is_cover} onChange={ev => void patchExample(e, { is_cover: ev.target.checked })} />표지
                        </label>
                        <button type="button" aria-label="앞으로" disabled={busy || i === 0} onClick={() => move(i, -1)} className="ml-auto rounded border px-1 disabled:opacity-30">↑</button>
                        <button type="button" aria-label="뒤로" disabled={busy || i === examples.length - 1} onClick={() => move(i, 1)} className="rounded border px-1 disabled:opacity-30">↓</button>
                        <button type="button" disabled={busy} onClick={() => removeExample(e)} className="rounded border border-red-300 px-1 text-red-700">지우기</button>
                      </div>
                    </figure>
                  ))}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
