import type { OrderStatus } from '@takson/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChatPanel } from '@/components/ChatPanel';
import { AssignPanel } from '@/components/AssignPanel';
import { EventTimeline, type TimelineEvent } from '@/components/EventTimeline';
import { OrderEditForm } from '@/components/OrderEditForm';
import { PhotoGrid, type SignedPhoto, type SignedReceipt } from '@/components/PhotoGrid';
import { StatusPanel } from '@/components/StatusPanel';
import { rowToForm } from '@/lib/orders/actions';
import { STATUS_LABEL } from '@/lib/orders/labels';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';

const SIGNED_URL_SEC = 60 * 60;

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getStaffProfile();
  if (!me) notFound();
  const supabase = await serverClient();
  const { data: order } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
  if (!order) notFound();

  const [companies, waypoints, missions, events, photos, receipts, missPickup, missDropoff] = await Promise.all([
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('order_waypoints').select('seq, address, detail').eq('order_id', id).order('seq'),
    supabase.from('order_missions').select('extra_fare, missions(name)').eq('order_id', id),
    supabase.from('order_events').select('id, type, from_status, to_status, reason, data, actor_id, created_at')
      .eq('order_id', id).order('created_at'),
    supabase.from('order_photos').select('phase, slot, path, taken_at').eq('order_id', id).order('created_at'),
    supabase.from('fuel_receipts').select('id, amount, path, created_at').eq('order_id', id).order('created_at'),
    supabase.rpc('missing_photos', { p_order_id: id, p_phase: 'pickup' }),
    supabase.rpc('missing_photos', { p_order_id: id, p_phase: 'dropoff' }),
  ]);

  // 이름: 배정 기사와 이력을 남긴 사람
  const peopleIds = [...new Set([order.driver_id, ...(events.data ?? []).map(e => e.actor_id)].filter(Boolean))] as string[];
  const people = peopleIds.length
    ? (await supabase.from('profiles').select('id, name, login_id').in('id', peopleIds)).data ?? []
    : [];
  const nameOf = (pid: string | null) => {
    const p = people.find(x => x.id === pid);
    return p ? (p.name ?? p.login_id) : null;
  };

  // 사진·영수증은 비공개 저장소라 1시간짜리 서명 주소로 보여 준다
  async function sign(bucket: string, paths: string[]) {
    if (!paths.length) return new Map<string, string>();
    const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_SEC);
    return new Map((data ?? []).filter(d => d.signedUrl && d.path).map(d => [d.path!, d.signedUrl]));
  }
  const photoUrls = await sign('order-photos', (photos.data ?? []).map(p => p.path));
  const receiptUrls = await sign('receipts', (receipts.data ?? []).map(r => r.path));
  const signedPhotos: SignedPhoto[] = (photos.data ?? []).map(p => ({ phase: p.phase, slot: p.slot, taken_at: p.taken_at, url: photoUrls.get(p.path) ?? null }));
  const signedReceipts: SignedReceipt[] = (receipts.data ?? []).map(r => ({ id: r.id, amount: r.amount, created_at: r.created_at, url: receiptUrls.get(r.path) ?? null }));

  const timeline: TimelineEvent[] = (events.data ?? []).map(e => ({ ...e, actor: nameOf(e.actor_id) }));
  const status = order.status as OrderStatus;
  const missing = { pickup: (missPickup.data ?? []) as string[], dropoff: (missDropoff.data ?? []) as string[] };
  const company = (companies.data ?? []).find(c => c.id === order.company_id);
  const missionList = (missions.data ?? []) as unknown as { extra_fare: number; missions: { name: string } | null }[];

  return (
    <div className="mx-auto grid max-w-7xl gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/orders" className="text-sm text-slate-500 hover:underline">← 관제판</Link>
        <h1 className="text-xl font-bold">{company?.name ?? '?'} · {order.pickup_area ?? '?'} → {order.dropoff_area ?? '?'}</h1>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-sm text-white">{STATUS_LABEL[status]}</span>
        {order.kind === 'daeri' && <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">대리</span>}
        {order.dispatch_mode === 'staff_only' && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">관제 배차 전용</span>}
      </div>

      {(waypoints.data?.length || missionList.length) ? (
        <div className="flex flex-wrap gap-6 text-sm text-slate-600">
          {waypoints.data?.length ? (
            <div>경유지: {waypoints.data.map(w => `${w.seq}. ${w.address}${w.detail ? ` ${w.detail}` : ''}`).join(' / ')}</div>
          ) : null}
          {missionList.length ? (
            <div>미션: {missionList.map(m => `${m.missions?.name ?? '?'}(+${m.extra_fare.toLocaleString('ko-KR')}원)`).join(', ')}</div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <AssignPanel orderId={id} status={status} driverName={nameOf(order.driver_id)} />
        <StatusPanel orderId={id} status={status} hasDriver={order.driver_id !== null} missing={missing} />
      </div>

      <PhotoGrid photos={signedPhotos} receipts={signedReceipts} />
      <OrderEditForm key={order.id} orderId={id} initial={rowToForm(order)} companies={companies.data ?? []} />
      <EventTimeline events={timeline} />
    </div>
    <div className="xl:sticky xl:top-6 xl:self-start">
      <ChatPanel orderId={id} myId={me.id} />
    </div>
    </div>
  );
}
