import { KIND_LABEL, type OrderKind, type OrderStatus } from '@takson/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignPanel } from '@/components/AssignPanel';
import { DocReviewPanel, type ReviewDoc } from '@/components/DocReviewPanel';
import { EventTimeline, type TimelineEvent } from '@/components/EventTimeline';
import { OrderEditForm } from '@/components/OrderEditForm';
import { PhotoGrid, type SignedPhoto, type SignedReceipt } from '@/components/PhotoGrid';
import { StatusPanel } from '@/components/StatusPanel';
import { rowToForm } from '@/lib/orders/actions';
import { docSlotLabel } from '@/lib/orders/docs';
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

  const [companies, waypoints, missions, allMissions, events, photos, receipts, missPickup, missDropoff, capitals, docs, examples, required] = await Promise.all([
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('order_waypoints').select('seq, address, detail, area, lat, lng, contact_name, contact_phone').eq('order_id', id).order('seq'),
    supabase.from('order_missions').select('mission_id, extra_fare, missions(name)').eq('order_id', id),
    supabase.from('missions').select('id, name, extra_fare, active').order('created_at'),
    supabase.from('order_events').select('id, type, from_status, to_status, reason, data, actor_id, created_at')
      .eq('order_id', id).order('created_at'),
    supabase.from('order_photos').select('id, phase, slot, path, taken_at, rejected_reason, source').eq('order_id', id).order('created_at'),
    supabase.from('fuel_receipts').select('id, amount, path, created_at').eq('order_id', id).order('created_at'),
    supabase.rpc('missing_photos', { p_order_id: id, p_phase: 'pickup' }),
    supabase.rpc('missing_photos', { p_order_id: id, p_phase: 'dropoff' }),
    supabase.from('capital_companies').select('id, name').order('sort').order('name'),
    supabase.from('order_documents').select('id, slot, path, status, reason, taken_at, source').eq('order_id', id),
    supabase.from('capital_examples').select('id, title').eq('company_id', order.capital_company_id ?? '00000000-0000-0000-0000-000000000000'),
    supabase.rpc('required_doc_slots', { p_order_id: id }),
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
  const signedPhotos: SignedPhoto[] = (photos.data ?? []).map(p => ({ id: p.id, phase: p.phase, slot: p.slot, taken_at: p.taken_at, rejected_reason: p.rejected_reason, fromGallery: p.source === 'gallery', url: photoUrls.get(p.path) ?? null }));
  // 서류 칸: 필요한 칸 순서대로, 지운 양식에 이미 올라온 서류는 뒤에 붙인다
  const docUrls = await sign('order-photos', (docs.data ?? []).map(d => d.path));
  const exList = examples.data ?? [];
  const docSlots = [...new Set([...((required.data ?? []) as string[]), ...(docs.data ?? []).map(d => d.slot)])];
  const reviewDocs: ReviewDoc[] = docSlots.map(slot => {
    const d = (docs.data ?? []).find(x => x.slot === slot);
    return { id: d?.id ?? null, slot, label: docSlotLabel(slot, exList), url: d ? docUrls.get(d.path) ?? null : null,
      status: (d?.status as ReviewDoc['status']) ?? null, reason: d?.reason ?? null, takenAt: d?.taken_at ?? null, fromGallery: d?.source === 'gallery' };
  });
  const capitalName = (capitals.data ?? []).find(c => c.id === order.capital_company_id)?.name ?? null;
  const signedReceipts: SignedReceipt[] = (receipts.data ?? []).map(r => ({ id: r.id, amount: r.amount, created_at: r.created_at, url: receiptUrls.get(r.path) ?? null }));

  const timeline: TimelineEvent[] = (events.data ?? []).map(e => ({ ...e, actor: nameOf(e.actor_id) }));
  const status = order.status as OrderStatus;
  const missing = { pickup: (missPickup.data ?? []) as string[], dropoff: (missDropoff.data ?? []) as string[] };
  const company = (companies.data ?? []).find(c => c.id === order.company_id);
  const missionList = (missions.data ?? []) as unknown as { mission_id: string; extra_fare: number; missions: { name: string } | null }[];
  // 수정 폼: 경유지는 주소 칸 모양으로, 미션은 지금 쓰는 것 + 이미 붙은 것
  const editWaypoints = (waypoints.data ?? []).map(w => ({
    address: w.address ?? '', detail: w.detail ?? '', area: w.area, lat: w.lat, lng: w.lng,
    contactName: w.contact_name ?? '', contactPhone: w.contact_phone ?? '',
  }));
  const attachedIds = missionList.map(m => m.mission_id);
  const editMissions = (allMissions.data ?? []).filter(m => m.active || attachedIds.includes(m.id));

  return (
    <div className="mx-auto max-w-7xl">
    <div className="min-w-0 space-y-4">
      {/* 스크롤해도 맨 위에 붙어 있는 줄: 목록으로, 저장(아래 '오더 내용 수정'을 저장) */}
      <div className="sticky top-0 z-20 -mx-6 -mt-6 flex flex-wrap items-center gap-3 border-b bg-[#f0f1ee] px-6 py-2">
        <Link href="/orders" className="rounded border bg-white px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">← 목록</Link>
        <button type="submit" form="order-edit" className="rounded bg-road px-4 py-1.5 text-sm font-semibold text-white">저장</button>
        <h1 className="text-xl font-bold">{order.order_no} · {company?.name ?? '?'} · {order.pickup_area ?? '?'} → {order.dropoff_area ?? '?'}</h1>
        <span className="rounded bg-ink px-2 py-0.5 text-sm text-white">{STATUS_LABEL[status]}</span>
        {order.kind === 'daeri' && <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">대리</span>}
        {order.kind === 'docs' && <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-800">{KIND_LABEL[order.kind as OrderKind]} · {capitalName ?? '?'}</span>}
        {order.dispatch_mode === 'staff_only' && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">관제 배차 전용</span>}
        <div id="order-save-note" className="ml-auto text-sm" />
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

      <PhotoGrid orderId={id} photos={signedPhotos} receipts={signedReceipts}
        rejectable={status === 'assigned' || status === 'arrived_pickup' ? 'pickup' : status === 'driving' ? 'dropoff' : null} />
      {order.kind === 'docs' && <DocReviewPanel orderId={id} capitalName={capitalName} sealCount={order.seal_count} docs={reviewDocs} />}
      <OrderEditForm key={order.id} orderId={id} initial={{ ...rowToForm(order, editWaypoints, attachedIds), sealCount: order.seal_count }} updatedAt={order.updated_at} companies={companies.data ?? []}
        capitals={capitals.data ?? []} missions={editMissions} />
      <EventTimeline events={timeline} />
    </div>
    </div>
  );
}
