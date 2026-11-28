import { PHOTO_SLOTS, SLOT_LABEL } from '@/lib/orders/actions';
import { PhotoReject } from './PhotoReject';

export type SignedPhoto = {
  id: string; phase: string; slot: string | null; url: string | null; taken_at: string | null; rejected_reason: string | null;
  /** 휴대폰 갤러리에서 고른 사진 (찍은 시각·위치를 믿을 수 없음) */
  fromGallery: boolean;
};

const GalleryTag = () =>
  <span className="rounded bg-violet-100 px-1 text-xs text-violet-800" title="휴대폰 갤러리에서 고른 사진이에요">갤러리</span>;
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

/** 출발·도착 필수 사진 6칸(빠진 칸 표시), 추가 사진, 주유 영수증 */
/** rejectable: 지금 불인정할 수 있는 단계(출발 사진은 운행 시작 전, 도착 사진은 완료 전) */
export function PhotoGrid({ orderId, photos, receipts, rejectable }: {
  orderId: string; photos: SignedPhoto[]; receipts: SignedReceipt[]; rejectable: 'pickup' | 'dropoff' | null;
}) {
  const find = (phase: string, slot: string) => photos.find(p => p.phase === phase && p.slot === slot);
  const extras = photos.filter(p => p.phase === 'extra');
  return (
    <section className="space-y-3 rounded border bg-white p-3">
      {(['pickup', 'dropoff'] as const).map(phase => (
        <div key={phase}>
          <h3 className="mb-1 text-sm font-semibold">{phase === 'pickup' ? '출발 사진' : '도착 사진'}</h3>
          {/* 한 장도 없으면 빈 칸 6개 대신 한 줄로 (일부만 있을 때는 빠진 칸을 보여 준다) */}
          {!photos.some(p => p.phase === phase) ? <p className="text-xs text-slate-500">아직 사진이 없어요.</p> : (
          <div className="grid grid-cols-6 gap-2">
            {PHOTO_SLOTS.map(slot => {
              const p = find(phase, slot);
              return (
                <figure key={slot}>
                  <Thumb url={p?.url ?? null} label={SLOT_LABEL[slot]} />
                  <figcaption className="text-center text-xs text-slate-500">{SLOT_LABEL[slot]} {p?.fromGallery && <GalleryTag />}</figcaption>
                  {p?.rejected_reason && <p className="text-center text-xs text-red-700">✗ 불인정: {p.rejected_reason}</p>}
                  {p && !p.rejected_reason && rejectable === phase && <PhotoReject orderId={orderId} photoId={p.id} />}
                </figure>
              );
            })}
          </div>
          )}
        </div>
      ))}
      {extras.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">추가 사진 {extras.length}장</h3>
          <div className="grid grid-cols-6 gap-2">
            {extras.map((p, i) => (
              <figure key={i}>
                <Thumb url={p.url} label={`추가 ${i + 1}`} />
                {p.fromGallery && <figcaption className="text-center"><GalleryTag /></figcaption>}
              </figure>
            ))}
          </div>
        </div>
      )}
      <div>
        <h3 className="mb-1 text-sm font-semibold">주유 영수증</h3>
        {receipts.length === 0
          ? <p className="text-xs text-slate-500">없어요.</p>
          : (
            <div className="grid grid-cols-6 gap-2">
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
