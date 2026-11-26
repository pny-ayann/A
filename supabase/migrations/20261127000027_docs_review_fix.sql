-- 서류탁송 검토 수정 (0026 다음)
-- 1. 관제가 화면에서 본 서류(taken_at)와 지금 서류가 다르면 인정·불인정을 거절한다 (DOC_CHANGED).
--    기사가 그 사이 다시 찍은 사진을 안 보고 인정하는 일을 막는다.
-- 2. 운행 중에는 서류를 불인정하지 않는다 (기사가 다시 올릴 수 없으므로).
-- 3. 인감 수량을 바꾸면 인감 서류를 다시 '확인 대기'로 (관제가 장수와 수량을 다시 맞춰 봐야 함).

drop function public.review_document(uuid, boolean, text);
create function public.review_document(p_doc_id uuid, p_ok boolean, p_reason text default null,
                                       p_taken_at timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  d public.order_documents;
  v_reason text := nullif(trim(p_reason), '');
  v_driver uuid;
  v_status text;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into d from public.order_documents where id = p_doc_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_taken_at is not null and d.taken_at is distinct from p_taken_at then raise exception 'DOC_CHANGED'; end if;
  if not p_ok and v_reason is null then raise exception 'REASON_REQUIRED'; end if;
  select driver_id, status into v_driver, v_status from public.orders where id = d.order_id;
  if not p_ok and v_status <> 'arrived_pickup' then raise exception 'INVALID_TRANSITION'; end if;
  update public.order_documents
  set status = case when p_ok then 'approved' else 'rejected' end,
      reason = case when p_ok then null else v_reason end,
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_doc_id;
  insert into public.order_events(order_id, actor_id, type, reason, data)
  values (d.order_id, auth.uid(), 'doc_review', case when p_ok then null else v_reason end,
          jsonb_build_object('slot', d.slot, 'label', public.doc_slot_label(d.slot), 'ok', p_ok));
  if not p_ok and v_driver is not null then
    perform public.send_push(array[v_driver], '서류를 다시 찍어 주세요',
      public.doc_slot_label(d.slot) || ' — ' || v_reason,
      jsonb_build_object('orderId', d.order_id, 'screen', 'order'));
  end if;
end $$;
revoke execute on function public.review_document(uuid, boolean, text, timestamptz) from public, anon;
grant execute on function public.review_document(uuid, boolean, text, timestamptz) to authenticated;

create or replace function public.set_seal_count(p_order_id uuid, p_count int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_old int;
begin
  select status, seal_count into v_status, v_old from public.orders where id = p_order_id and driver_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_count is null or p_count < 1 then raise exception 'SEAL_COUNT_REQUIRED'; end if;
  if v_status <> 'arrived_pickup' then raise exception 'INVALID_TRANSITION'; end if;
  perform public.set_rpc_context(null, null, null); -- 기사 오더 수정 가드(guard_order_update)를 RPC로 통과
  update public.orders set seal_count = p_count where id = p_order_id;
  if v_old is distinct from p_count then
    -- 부른 사람이 기사라 order_documents_reset 트리거가 '확인 대기'로 되돌린다
    update public.order_documents set taken_at = taken_at where order_id = p_order_id and slot = 'seal';
  end if;
end $$;
