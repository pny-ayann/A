-- 주유 영수증, 문의(메시지), 기사 위치, 푸시 토큰, 관제 후보 기사

-- 주유 영수증 ------------------------------------------------------------------
create table public.fuel_receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid not null default auth.uid() references public.profiles(id),
  amount int not null check (amount > 0),
  path text not null,
  created_at timestamptz not null default now()
);

-- 관제, 그 오더의 배정 기사, 그 업체가 '고객 청구'일 때 그 업체 고객
create function public.can_read_receipt(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() or exists (
    select 1 from public.orders o join public.companies c on c.id = o.company_id
    where o.id = p_order_id
      and (o.driver_id = auth.uid()
           or (o.company_id = public.my_company_id() and c.fuel_billing = 'customer'))
  )
$$;

create function public.can_add_receipt(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.driver_id = auth.uid() and o.status in ('arrived_pickup', 'driving')
  )
$$;

alter table public.fuel_receipts enable row level security;
create policy fuel_receipts_select on public.fuel_receipts for select using (public.can_read_receipt(order_id));
create policy fuel_receipts_insert on public.fuel_receipts for insert
  with check (public.is_staff() or (driver_id = auth.uid() and public.can_add_receipt(order_id)));
create policy fuel_receipts_update on public.fuel_receipts for update using (public.is_staff()) with check (public.is_staff());
create policy fuel_receipts_delete on public.fuel_receipts for delete using (public.is_staff());

-- 문의 --------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  thread text not null check (thread in ('customer', 'driver')),
  sender_id uuid not null default auth.uid() references public.profiles(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index messages_order_idx on public.messages(order_id, thread);

-- 관제는 모든 스레드, 고객은 자기 업체 오더의 customer 스레드, 기사는 자기 배정 오더의 driver 스레드
create function public.can_access_thread(p_order_id uuid, p_thread text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() or exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and ((p_thread = 'customer' and o.company_id = public.my_company_id())
           or (p_thread = 'driver' and o.driver_id = auth.uid()))
  )
$$;

alter table public.messages enable row level security;
create policy messages_select on public.messages for select using (public.can_access_thread(order_id, thread));
create policy messages_insert on public.messages for insert
  with check (sender_id = auth.uid() and public.can_access_thread(order_id, thread));

create table public.thread_reads (
  order_id uuid not null references public.orders(id) on delete cascade,
  thread text not null check (thread in ('customer', 'driver')),
  user_id uuid not null default auth.uid(),
  read_at timestamptz not null default now(),
  primary key (order_id, thread, user_id)
);
alter table public.thread_reads enable row level security;
create policy thread_reads_own on public.thread_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 호출자가 볼 수 있는 스레드별, 남이 쓴 안 읽은 메시지 수 (RLS로 범위가 정해짐)
create function public.unread_counts() returns table(order_id uuid, thread text, unread int)
language sql stable as $$
  select m.order_id, m.thread, count(*)::int
  from public.messages m
  left join public.thread_reads r
    on r.order_id = m.order_id and r.thread = m.thread and r.user_id = auth.uid()
  where m.sender_id is distinct from auth.uid()
    and (r.read_at is null or m.created_at > r.read_at)
  group by m.order_id, m.thread
$$;

-- 기사 위치 ------------------------------------------------------------------------
create table public.driver_locations (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.driver_locations enable row level security;
create policy driver_locations_select on public.driver_locations for select using (
  driver_id = auth.uid()
  or public.is_staff()
  or exists (
    select 1 from public.orders o
    where o.driver_id = driver_locations.driver_id and o.company_id = public.my_company_id()
      and o.status in ('assigned', 'arrived_pickup', 'driving')
  )
);
create policy driver_locations_own on public.driver_locations for all
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());

create function public.report_location(p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'driver' then raise exception 'FORBIDDEN'; end if;
  insert into public.driver_locations(driver_id, lat, lng, updated_at)
  values (auth.uid(), p_lat, p_lng, now())
  on conflict (driver_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now();
end $$;

-- RPC가 기사 위치를 받으면 driver_locations도 갱신한다 (claim_order, advance_order)
create or replace function public.set_rpc_context(p_reason text, p_lat double precision, p_lng double precision)
returns void
language plpgsql as $$
begin
  perform set_config('app.rpc', 'on', true);
  perform set_config('app.reason', coalesce(p_reason, ''), true);
  perform set_config('app.lat', coalesce(p_lat::text, ''), true);
  perform set_config('app.lng', coalesce(p_lng::text, ''), true);
  if p_lat is not null and p_lng is not null and public.my_role() = 'driver' then
    insert into public.driver_locations(driver_id, lat, lng, updated_at)
    values (auth.uid(), p_lat, p_lng, now())
    on conflict (driver_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now();
  end if;
end $$;
revoke execute on function public.set_rpc_context(text, double precision, double precision) from public, anon, authenticated;

-- 관제 강제 배차용 후보 기사 -----------------------------------------------------------
create function public.staff_driver_candidates(p_order_id uuid)
returns table(driver_id uuid, name text, phone text, distance_km double precision, active_count int, conflicts text[])
language plpgsql stable security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  return query
    select p.id, p.name, p.phone,
           case when l.lat is not null and v_order.pickup_lat is not null
                then public.haversine_km(l.lat, l.lng, v_order.pickup_lat, v_order.pickup_lng) end,
           (select count(*)::int from public.orders o
            where o.driver_id = p.id and o.status in ('assigned', 'arrived_pickup', 'driving')),
           public.driver_conflicts(p.id, v_order.reserved_at, p_order_id)
    from public.profiles p
    left join public.driver_locations l on l.driver_id = p.id
    where p.role = 'driver' and p.driver_status = 'active'
    order by 4 nulls last, p.name;
end $$;

-- 푸시 토큰 ----------------------------------------------------------------------------
create table public.push_tokens (
  user_id uuid not null default auth.uid(),
  token text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table public.push_tokens enable row level security;
create policy push_tokens_own on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());
