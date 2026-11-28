'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { setOrderStatus } from '@/app/(staff)/orders/[id]/actions';
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/orders/labels';
import type { OrderRow } from '@/lib/orders/realtime';

/** 관제판에서 오더를 오른쪽 클릭하면 뜨는 상태 바꾸기 메뉴. 사유는 취소·사진 없이 진행할 때 필수 (서버가 판단) */
export function StatusMenu({ order, x, y, onClose }: { order: OrderRow; x: number; y: number; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    box.current?.querySelector('input')?.focus();
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);

  // 기사가 없으면 '배차됨' 이후 상태는 고를 수 없다 (서버도 막는다)
  const choices = STATUS_ORDER.filter(s => s !== order.status && (order.driver_id !== null || s === 'open' || s === 'cancelled'));
  // 화면 밖으로 나가지 않게
  const left = Math.min(x, window.innerWidth - 240);
  const top = Math.min(y, window.innerHeight - 300);

  return (
    <div ref={box} role="menu" aria-label={`${order.order_no} 상태 바꾸기`} style={{ left, top }}
      className="fixed z-50 w-56 space-y-2 rounded border bg-white p-2 text-sm shadow-lg">
      <div className="font-semibold">{order.order_no} · 지금 {STATUS_LABEL[order.status]}</div>
      <input aria-label="상태 변경 사유" value={reason} onChange={e => setReason(e.target.value)}
        placeholder="사유 (취소는 필수)" className="w-full rounded border px-2 py-1" />
      <div className="flex flex-col">
        {choices.map(s => (
          <button key={s} type="button" role="menuitem" disabled={pending}
            onClick={() => {
              if (s === 'cancelled' && !reason.trim()) { setMsg({ ok: false, text: '취소는 사유를 적어 주세요.' }); return; }
              start(async () => {
                const r = await setOrderStatus(order.id, s, reason);
                setMsg({ ok: r.ok, text: r.message });
                if (r.ok) onClose();
              });
            }}
            className="rounded px-2 py-1 text-left hover:bg-slate-100 disabled:opacity-50">
            → {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {statusLine(pending, msg)}
    </div>
  );
}

const statusLine = (pending: boolean, msg: { ok: boolean; text: string } | null) =>
  pending ? <p className="text-slate-500">바꾸는 중…</p>
    : msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-green-700' : 'text-red-600'}>{msg.text}</p>;
