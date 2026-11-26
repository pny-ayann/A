-- 서류탁송 1단계 (설계: docs/superpowers/specs/2026-11-27-서류탁송-design.md)
-- 오더 종류 docs, 캐피탈 회사·예시 양식, 서류 사진 칸(order_documents)과 관제 인정/불인정,
-- 인감 수량, 서류가 모두 인정돼야 운행 시작, 차량 사진 불인정.

-- 1. 캐피탈 회사와 예시 양식 ------------------------------------------------------------
create table public.capital_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort int not null default 0
);
create table public.capital_examples (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.capital_companies(id) on delete cascade,
  seq int not null,
  title text not null,
  path text not null,
  is_cover boolean not null default false
);
create index capital_examples_company_idx on public.capital_examples(company_id, seq);

alter table public.capital_companies enable row level security;
alter table public.capital_examples enable row level security;
create policy capital_companies_select on public.capital_companies for select using (auth.uid() is not null);
create policy capital_companies_admin on public.capital_companies for all using (public.is_admin()) with check (public.is_admin());
create policy capital_examples_select on public.capital_examples for select using (auth.uid() is not null);
create policy capital_examples_admin on public.capital_examples for all using (public.is_admin()) with check (public.is_admin());

-- 예시 양식 사진 창고(비공개): 로그인한 사람은 보고, 관리자만 바꾼다
insert into storage.buckets(id, name, public) values ('capital-examples', 'capital-examples', false)
on conflict (id) do nothing;
create policy capital_examples_files_select on storage.objects for select using (
  bucket_id = 'capital-examples' and auth.uid() is not null
);
create policy capital_examples_files_insert on storage.objects for insert with check (
  bucket_id = 'capital-examples' and public.is_admin()
);
create policy capital_examples_files_update on storage.objects for update using (
  bucket_id = 'capital-examples' and public.is_admin()
);
create policy capital_examples_files_delete on storage.objects for delete using (
  bucket_id = 'capital-examples' and public.is_admin()
);

-- 2. 오더: 종류 docs, 캐피탈 회사, 인감 수량 ----------------------------------------------
alter table public.orders drop constraint orders_kind_check;
alter table public.orders add constraint orders_kind_check check (kind in ('takson', 'docs', 'daeri'));
alter table public.orders
  add column capital_company_id uuid references public.capital_companies(id),
  add column seal_count int check (seal_count >= 1);

-- 서류탁송이면 캐피탈 회사가 꼭 있고, 아니면 비운다 (접수·수정 어느 길로 와도)
create function public.orders_capital_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.kind = 'docs' then
    if new.capital_company_id is null then raise exception 'CAPITAL_REQUIRED'; end if;
  else
    new.capital_company_id := null;
  end if;
  return new;
end $$;
create trigger orders_capital_check before insert or update of kind, capital_company_id on public.orders
  for each row execute function public.orders_capital_check();

-- 3. 서류 사진 칸 ------------------------------------------------------------------------
-- slot: 'registration'(자동차등록증) | 'seal'(인감) | capital_examples.id
-- 파일: order-photos 버킷 <order_id>/docs/<slot>.jpg
create table public.order_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  slot text not null,
  path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  taken_at timestamptz not null default now(),
  unique (order_id, slot)
);

-- (order_documents 규칙은 실시간 anon 구독자 오류를 막으려고 to authenticated, 0012 참고)
-- 지금 오더 상태에서 이 단계 사진을 올릴 수 있는지 (0004 정의 + docs: 오더수락 뒤 운행 시작 전)
create or replace function public.photo_phase_open(p_order_id uuid, p_phase text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.driver_id = auth.uid()
      and case p_phase
            when 'pickup' then o.status in ('assigned', 'arrived_pickup')
            when 'dropoff' then o.status = 'driving'
            when 'extra' then o.status in ('assigned', 'arrived_pickup', 'driving')
            when 'docs' then o.status = 'arrived_pickup'
            else false
          end
  )
$$;

alter table public.order_documents enable row level security;
create policy order_documents_select on public.order_documents for select to authenticated using (public.can_read_order(order_id));
create policy order_documents_insert on public.order_documents for insert to authenticated
  with check (public.is_staff() or public.photo_phase_open(order_id, 'docs'));
create policy order_documents_update on public.order_documents for update to authenticated
  using (public.is_staff() or public.photo_phase_open(order_id, 'docs'))
  with check (public.is_staff() or public.photo_phase_open(order_id, 'docs'));
create policy order_documents_delete on public.order_documents for delete to authenticated using (public.is_staff());

-- 기사가 올리거나 다시 찍으면 언제나 '관제 확인 중'으로 돌아간다 (기사는 인정으로 못 바꿈)
create function public.order_documents_reset() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_staff() then
    new.status := 'pending';
    new.reason := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end $$;
create trigger order_documents_reset before insert or update on public.order_documents
  for each row execute function public.order_documents_reset();

alter publication supabase_realtime add table public.order_documents;

-- 칸 이름 (푸시 문구)
create function public.doc_slot_label(p_slot text) returns text
language sql stable security definer set search_path = public as $$
  select case p_slot
    when 'registration' then '자동차등록증'
    when 'seal' then '인감(본인서명사실확인서)'
    else coalesce((select e.title from public.capital_examples e where e.id::text = p_slot), '캐피탈 서류')
  end
$$;

-- 이 오더에 필요한 서류 칸 (일반탁송·대리는 없음). 지운 예시·표지는 요구하지 않는다
create function public.required_doc_slots(p_order_id uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  o public.orders;
begin
  if auth.uid() is not null and not public.can_read_order(p_order_id) then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id;
  if not found or o.kind <> 'docs' then return '{}'; end if;
  return array['registration', 'seal'] || coalesce((
    select array_agg(e.id::text order by e.seq) from public.capital_examples e
    where e.company_id = o.capital_company_id and not e.is_cover), '{}');
end $$;

-- 서류 상태 한눈에: 빠짐 / 불인정(이유) / 관제 확인 중 / 인감 수량 적었는지
create function public.missing_documents(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_out jsonb;
begin
  if auth.uid() is not null and not public.can_read_order(p_order_id) then raise exception 'FORBIDDEN'; end if;
  with req as (
    select t.s, t.ord, d.status, d.reason
    from unnest(public.required_doc_slots(p_order_id)) with ordinality as t(s, ord)
    left join lateral (
      select doc.status, doc.reason from public.order_documents doc
      join storage.objects so on so.bucket_id = 'order-photos' and so.name = doc.path
      where doc.order_id = p_order_id and doc.slot = t.s
    ) d on true
  )
  select jsonb_build_object(
    'missing', coalesce((select jsonb_agg(s order by ord) from req where status is null), '[]'),
    'rejected', coalesce((select jsonb_agg(jsonb_build_object('slot', s, 'reason', reason) order by ord)
                          from req where status = 'rejected'), '[]'),
    'pending', coalesce((select jsonb_agg(s order by ord) from req where status = 'pending'), '[]'),
    'seal_count', (select o.kind <> 'docs' or o.seal_count is not null from public.orders o where o.id = p_order_id)
  ) into v_out;
  return v_out;
end $$;

-- 인감 수량: 배정 기사가 오더수락 뒤에만
create function public.set_seal_count(p_order_id uuid, p_count int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  select status into v_status from public.orders where id = p_order_id and driver_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_count is null or p_count < 1 then raise exception 'SEAL_COUNT_REQUIRED'; end if;
  if v_status <> 'arrived_pickup' then raise exception 'INVALID_TRANSITION'; end if;
  perform public.set_rpc_context(null, null, null); -- 기사 오더 수정 가드(guard_order_update)를 RPC로 통과
  update public.orders set seal_count = p_count where id = p_order_id;
end $$;

-- 관제: 서류 인정/불인정. 불인정이면 이유를 기사에게 푸시
create function public.review_document(p_doc_id uuid, p_ok boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  d public.order_documents;
  v_reason text := nullif(trim(p_reason), '');
  v_driver uuid;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into d from public.order_documents where id = p_doc_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not p_ok and v_reason is null then raise exception 'REASON_REQUIRED'; end if;
  update public.order_documents
  set status = case when p_ok then 'approved' else 'rejected' end,
      reason = case when p_ok then null else v_reason end,
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_doc_id;
  insert into public.order_events(order_id, actor_id, type, reason, data)
  values (d.order_id, auth.uid(), 'doc_review', case when p_ok then null else v_reason end,
          jsonb_build_object('slot', d.slot, 'label', public.doc_slot_label(d.slot), 'ok', p_ok));
  if not p_ok then
    select driver_id into v_driver from public.orders where id = d.order_id;
    if v_driver is not null then
      perform public.send_push(array[v_driver], '서류를 다시 찍어 주세요',
        public.doc_slot_label(d.slot) || ' — ' || v_reason,
        jsonb_build_object('orderId', d.order_id, 'screen', 'order'));
    end if;
  end if;
end $$;

-- 4. 차량 사진 불인정 ---------------------------------------------------------------------
alter table public.order_photos add column rejected_reason text;

-- 기사가 다시 올리면 불인정 표시를 지운다 (기사는 불인정을 직접 적을 수도 없다)
create function public.order_photos_reset() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_staff() then new.rejected_reason := null; end if;
  return new;
end $$;
create trigger order_photos_reset before insert or update on public.order_photos
  for each row execute function public.order_photos_reset();

-- 0025 정의 + 불인정 칸도 빠진 것으로
create or replace function public.missing_photos(p_order_id uuid, p_phase text) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_out text[];
begin
  if auth.uid() is not null and not public.can_read_order(p_order_id) then
    raise exception 'FORBIDDEN';
  end if;
  select coalesce(array_agg(s order by ord), '{}') into v_out
  from unnest(array['front', 'back', 'left', 'right', 'dashboard', 'key']) with ordinality as t(s, ord)
  where not exists (
    select 1 from public.order_photos p
    join storage.objects so on so.bucket_id = 'order-photos' and so.name = p.path
    where p.order_id = p_order_id and p.phase = p_phase and p.slot = t.s and p.rejected_reason is null
  );
  return v_out;
end $$;

-- 관제: 차량 사진 불인정. 그 사진을 다시 찍을 수 있는 동안만
create function public.reject_photo(p_photo_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.order_photos;
  o public.orders;
  v_reason text := nullif(trim(p_reason), '');
  v_slot text;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
  select * into p from public.order_photos where id = p_photo_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into o from public.orders where id = p.order_id;
  if not ((p.phase = 'pickup' and o.status in ('assigned', 'arrived_pickup'))
          or (p.phase = 'dropoff' and o.status = 'driving')) then
    raise exception 'INVALID_TRANSITION';
  end if;
  update public.order_photos set rejected_reason = v_reason where id = p_photo_id;
  v_slot := case p.slot when 'front' then '앞' when 'back' then '뒤' when 'left' then '왼쪽'
                        when 'right' then '오른쪽' when 'dashboard' then '계기판' when 'key' then '차키' else p.slot end;
  insert into public.order_events(order_id, actor_id, type, reason, data)
  values (p.order_id, auth.uid(), 'photo_reject', v_reason, jsonb_build_object('phase', p.phase, 'slot', p.slot));
  if o.driver_id is not null then
    perform public.send_push(array[o.driver_id], '사진을 다시 찍어 주세요',
      case p.phase when 'pickup' then '출발' else '도착' end || ' 사진 ' || v_slot || ' — ' || v_reason,
      jsonb_build_object('orderId', p.order_id, 'screen', 'order'));
  end if;
end $$;

-- 5. 운행 시작 조건: 서류탁송은 인감 수량 + 서류 모두 인정 (0004 정의 + 서류 검사) ----------------
create or replace function public.advance_order(p_order_id uuid, p_lat double precision default null,
                                                p_lng double precision default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_next text;
  v_docs jsonb;
begin
  select status into v_status from public.orders where id = p_order_id and driver_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_next := case v_status
    when 'assigned' then 'arrived_pickup'
    when 'arrived_pickup' then 'driving'
    when 'driving' then 'completed'
  end;
  if v_next is null then raise exception 'INVALID_TRANSITION'; end if;
  if v_next = 'driving' and cardinality(public.missing_photos(p_order_id, 'pickup')) > 0 then
    raise exception 'PHOTOS_REQUIRED';
  end if;
  if v_next = 'driving' then
    v_docs := public.missing_documents(p_order_id);
    if not (v_docs->>'seal_count')::boolean then raise exception 'SEAL_COUNT_REQUIRED'; end if;
    if jsonb_array_length(v_docs->'missing') > 0 or jsonb_array_length(v_docs->'rejected') > 0 then
      raise exception 'DOCS_REQUIRED';
    end if;
    if jsonb_array_length(v_docs->'pending') > 0 then raise exception 'DOCS_NOT_APPROVED'; end if;
  end if;
  if v_next = 'completed' and cardinality(public.missing_photos(p_order_id, 'dropoff')) > 0 then
    raise exception 'PHOTOS_REQUIRED';
  end if;

  perform public.set_rpc_context(null, p_lat, p_lng);
  update public.orders set status = v_next where id = p_order_id;
  return v_next;
end $$;

revoke execute on function public.review_document(uuid, boolean, text) from public, anon;
revoke execute on function public.reject_photo(uuid, text) from public, anon;
revoke execute on function public.set_seal_count(uuid, int) from public, anon;
revoke execute on function public.missing_documents(uuid) from public, anon;
revoke execute on function public.required_doc_slots(uuid) from public, anon;
grant execute on function public.review_document(uuid, boolean, text) to authenticated;
grant execute on function public.reject_photo(uuid, text) to authenticated;
grant execute on function public.set_seal_count(uuid, int) to authenticated;
grant execute on function public.missing_documents(uuid) to authenticated;
grant execute on function public.required_doc_slots(uuid) to authenticated;

-- 6. 접수: 캐피탈 회사 저장 (0017 정의 + capital_company_id) -----------------------------------
create or replace function public.create_order(p_order jsonb, p_waypoints jsonb, p_mission_ids uuid[])
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  r public.orders;
  v_id uuid;
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_mission_ids, '{}')) x);
  v_found int;
begin
  select count(*) into v_found from public.missions where id = any(v_ids) and active;
  if v_found <> cardinality(v_ids) then raise exception 'INVALID_MISSION'; end if;

  r := jsonb_populate_record(null::public.orders, p_order);
  insert into public.orders(
    company_id, kind, capital_company_id, dispatch_mode, reserved_at,
    pickup_address, pickup_detail, pickup_area, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_detail, dropoff_area, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    vehicle_number, vehicle_model, vehicle_color, transmission, driver_memo, payment_method, fare, distance_km
  ) values (
    r.company_id, r.kind, r.capital_company_id, coalesce(r.dispatch_mode, 'open'), r.reserved_at,
    r.pickup_address, r.pickup_detail, r.pickup_area, r.pickup_lat, r.pickup_lng, r.pickup_contact_name, r.pickup_contact_phone,
    r.dropoff_address, r.dropoff_detail, r.dropoff_area, r.dropoff_lat, r.dropoff_lng, r.dropoff_contact_name, r.dropoff_contact_phone,
    r.vehicle_number, r.vehicle_model, r.vehicle_color, r.transmission, r.driver_memo, r.payment_method, r.fare, r.distance_km
  ) returning id into v_id;

  insert into public.order_waypoints(order_id, seq, address, detail, area, lat, lng, contact_name, contact_phone)
  select v_id, x.n, x.w->>'address', x.w->>'detail', x.w->>'area',
         (x.w->>'lat')::double precision, (x.w->>'lng')::double precision, x.w->>'contact_name', x.w->>'contact_phone'
  from jsonb_array_elements(coalesce(p_waypoints, '[]'::jsonb)) with ordinality as x(w, n);

  insert into public.order_missions(order_id, mission_id, extra_fare)
  select v_id, m.id, m.extra_fare from public.missions m where m.id = any(v_ids);

  return v_id;
end $$;

-- 7. 기사 공개 오더 목록에 캐피탈 회사 이름 (0023 정의 + capital_name) ---------------------------
drop function public.list_open_orders(double precision, double precision);
create function public.list_open_orders(p_lat double precision default null,
                                        p_lng double precision default null)
returns table(id uuid, order_no text, kind text, reserved_at timestamptz, pickup_area text, dropoff_area text, fare int,
              payment_method text, distance_km double precision, mission_names text[], capital_name text)
language sql stable security definer set search_path = public as $$
  with base as (
    select o.*,
           case when p_lat is not null and p_lng is not null and o.pickup_lat is not null and o.pickup_lng is not null
                then ceil(public.haversine_km(p_lat, p_lng, o.pickup_lat, o.pickup_lng) * 2) / 2 end as km
    from public.orders o
    where public.is_active_driver() and o.status = 'open' and o.dispatch_mode = 'open'
  )
  select b.id, b.order_no, b.kind, b.reserved_at, b.pickup_area, b.dropoff_area, b.fare, b.payment_method, b.km,
         coalesce((select array_agg(m.name order by m.name)
                   from public.order_missions om join public.missions m on m.id = om.mission_id
                   where om.order_id = b.id), '{}'),
         (select c.name from public.capital_companies c where c.id = b.capital_company_id)
  from base b
  order by (b.reserved_at is not null),
           case when b.reserved_at is null then b.km end nulls last,
           b.reserved_at,
           b.created_at
$$;
revoke execute on function public.list_open_orders(double precision, double precision) from public, anon;
grant execute on function public.list_open_orders(double precision, double precision) to authenticated;
