'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { rejectPhoto } from '@/app/(staff)/orders/[id]/actions';
import { RejectForm } from './RejectForm';

/** 차량 사진 한 칸 불인정 (기사가 다시 찍으면 풀린다) */
export function PhotoReject({ orderId, photoId }: { orderId: string; photoId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <RejectForm busy={pending} onReject={reason => start(async () => {
        const r = await rejectPhoto(orderId, photoId, reason);
        setMsg(r.ok ? null : r.message);
        if (r.ok) router.refresh();
      })} />
      {msg && <p className="text-xs text-red-700">{msg}</p>}
    </div>
  );
}
