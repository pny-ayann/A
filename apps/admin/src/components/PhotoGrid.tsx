import { PHOTO_SLOTS, SLOT_LABEL } from '@/lib/orders/actions';

export type SignedPhoto = { phase: string; slot: string | null; url: string | null; taken_at: string | null };
export type SignedReceipt = { id: string; amount: number; url: string | null; created_at: string };

const kst = (iso: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(iso));

function Thumb({ url, label }: { url: string | null; label: string }) {
  if (!url) {
    return <div className="flex h-24 items-center justify-center rounded border border-dashed border-red-300 bg-red-50 text-xs text-red-600">{label} 없음</div>;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL은 next/image 최적화 대상이 아님 */}
      <img src={url} alt={label} className="h-24 w-full rounded border object-cover" />
    </a>
  );
}

/** 출발·도착 필수 사진 5칸(빠진 칸 표시), 추가 사진, 주유 영수증 */
export function PhotoGrid({ photos, receipts }: { photos: SignedPhoto[]; receipts: SignedReceipt[] }) {
  const find = (phase: string, slot: string) => photos.find(p => p.phase === phase && p.slot === slot);
  const extras = photos.filter(p => p.phase === 'extra');
  return (
    <section className="space-y-3 rounded border bg-white p-3">
      {(['pickup', 'dropoff'] as const).map(phase => (
        <div key={phase}>
          <h3 className="mb-1 text-sm font-semibold">{phase === 'pickup' ? '출발 사진' : '도착 사진'}</h3>
          <div className="grid grid-cols-5 gap-2">
            {PHOTO_SLOTS.map(slot => {
              const p = find(phase, slot);
              return (
                <figure key={slot}>
                  <Thumb url={p?.url ?? null} label={SLOT_LABEL[slot]} />
                  <figcaption className="text-center text-xs text-slate-500">{SLOT_LABEL[slot]}</figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      ))}
      {extras.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">추가 사진 {extras.length}장</h3>
          <div className="grid grid-cols-5 gap-2">
            {extras.map((p, i) => <Thumb key={i} url={p.url} label={`추가 ${i + 1}`} />)}
          </div>
        </div>
      )}
      <div>
        <h3 className="mb-1 text-sm font-semibold">주유 영수증</h3>
        {receipts.length === 0
          ? <p className="text-xs text-slate-500">없어요.</p>
          : (
            <div className="grid grid-cols-5 gap-2">
              {receipts.map(r => (
                <figure key={r.id}>
                  <Thumb url={r.url} label="영수증" />
                  <figcaption className="text-center text-xs">{r.amount.toLocaleString('ko-KR')}원 · {kst(r.created_at)}</figcaption>
                </figure>
              ))}
            </div>
          )}
      </div>
    </section>
  );
}
