'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { reviewDocument, type Result } from '@/app/(staff)/orders/[id]/actions';
import { RejectForm } from './RejectForm';

export type ReviewDoc = {
  id: string | null; slot: string; label: string; url: string | null;
  status: 'pending' | 'approved' | 'rejected' | null; reason: string | null;
  /** 화면에 보인 서류를 찍은 시각 (인정·불인정 때 함께 보내 바뀐 서류를 거절) */
  takenAt: string | null;
  /** 휴대폰 갤러리에서 고른 사진 */
  fromGallery: boolean;
};

const BADGE = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
} as const;
const STATUS_TEXT = { pending: '확인 대기', approved: '✓ 인정', rejected: '✗ 불인정' } as const;

/** 서류탁송: 칸마다 서류 사진, [인정] / 불인정(이유). 인감 수량도 보여 준다 */
export function DocReviewPanel({ orderId, capitalName, sealCount, docs }: {
  orderId: string; capitalName: string | null; sealCount: number | null; docs: ReviewDoc[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const act = (d: ReviewDoc, ok: boolean, reason = '') => start(async () => {
    const r = await reviewDocument(orderId, d.id!, ok, reason, d.takenAt!);
    setResult(r);
    router.refresh();
  });
  return (
    <section className="space-y-2 rounded border bg-white p-3">
      <h3 className="text-sm font-semibold">
        서류 사진 · {capitalName ?? '캐피탈 회사 없음'} · 인감 수량 {sealCount === null ? <span className="text-red-600">미입력</span> : `${sealCount}장`}
      </h3>
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-5">
        {docs.map(d => (
          <figure key={d.slot} className="space-y-1">
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL */}
                <img src={d.url} alt={d.label} className="h-32 w-full rounded border object-contain bg-slate-50" />
              </a>
            ) : (
              <div className="flex h-32 items-center justify-center rounded border border-dashed border-red-300 bg-red-50 text-xs text-red-600">아직 없음</div>
            )}
            <figcaption className="text-xs">
              <div className="font-medium">{d.label}</div>
              {d.status && <span className={`rounded px-1 ${BADGE[d.status]}`}>{STATUS_TEXT[d.status]}</span>}
              {d.fromGallery && <span className="ml-1 rounded bg-violet-100 px-1 text-violet-800" title="휴대폰 갤러리에서 고른 사진이에요">갤러리</span>}
              {d.status === 'rejected' && d.reason && <div className="text-red-700">{d.reason}</div>}
            </figcaption>
            {d.id && d.status !== 'approved' && (
              <button type="button" disabled={pending} onClick={() => act(d, true)}
                className="w-full rounded bg-road px-2 py-0.5 text-xs text-white disabled:opacity-40">인정</button>
            )}
            {d.id && d.status !== 'rejected' && <RejectForm busy={pending} onReject={reason => act(d, false, reason)} />}
          </figure>
        ))}
      </div>
      {result && <p className={`text-sm ${result.ok ? 'text-green-700' : 'text-red-700'}`}>{result.message}</p>}
    </section>
  );
}
