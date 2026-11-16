-- 권한 도우미 함수와 기본 테이블 RLS

create function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.my_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid() and role = 'customer'
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'staff')
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and staff_level = 'admin')
$$;

create function public.is_active_driver() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'driver' and driver_status = 'active')
$$;

-- 관제, 그 오더 업체의 고객, 그 오더의 배정 기사
create function public.can_read_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() or exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (o.driver_id = auth.uid() or o.company_id = public.my_company_id())
  )
$$;

-- 관제, 또는 진행 중인 그 오더의 배정 기사
create function public.can_write_order_files(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() or exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.driver_id = auth.uid()
      and o.status in ('assigned', 'arrived_pickup', 'driving')
  )
$$;

-- profiles ---------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or public.is_staff()
  or (role = 'driver' and exists (
    select 1 from public.orders o
    where o.driver_id = profiles.id and o.company_id = public.my_company_id()
  ))
);
create policy profiles_update_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update using (public.is_admin()) with check (public.is_admin());
create policy profiles_delete_admin on public.profiles for delete using (public.is_admin());

-- 관리자가 아니면 이름과 전화만 바꿀 수 있다
create function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if (to_jsonb(new) - 'name' - 'phone') is distinct from (to_jsonb(old) - 'name' - 'phone') then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end $$;
create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- companies --------------------------------------------------------------
alter table public.companies enable row level security;
create policy companies_select on public.companies for select using (public.is_staff() or id = public.my_company_id());
create policy companies_admin_insert on public.companies for insert with check (public.is_admin());
create policy companies_admin_update on public.companies for update using (public.is_admin()) with check (public.is_admin());
create policy companies_admin_delete on public.companies for delete using (public.is_admin());

-- driver_documents -------------------------------------------------------
alter table public.driver_documents enable row level security;
create policy driver_documents_select on public.driver_documents for select using (driver_id = auth.uid() or public.is_staff());
create policy driver_documents_insert on public.driver_documents for insert with check (driver_id = auth.uid() or public.is_admin());
create policy driver_documents_update on public.driver_documents for update using (public.is_admin()) with check (public.is_admin());
create policy driver_documents_delete on public.driver_documents for delete using (public.is_admin());

-- settings, fare_bands, missions: 모두 읽기, 관리자만 쓰기 ------------------
alter table public.settings enable row level security;
create policy settings_select on public.settings for select using (auth.uid() is not null);
create policy settings_admin on public.settings for update using (public.is_admin()) with check (public.is_admin());

alter table public.fare_bands enable row level security;
create policy fare_bands_select on public.fare_bands for select using (auth.uid() is not null);
create policy fare_bands_insert on public.fare_bands for insert with check (public.is_admin());
create policy fare_bands_update on public.fare_bands for update using (public.is_admin()) with check (public.is_admin());
create policy fare_bands_delete on public.fare_bands for delete using (public.is_admin());

alter table public.missions enable row level security;
create policy missions_select on public.missions for select using (auth.uid() is not null);
create policy missions_insert on public.missions for insert with check (public.is_admin());
create policy missions_update on public.missions for update using (public.is_admin()) with check (public.is_admin());
create policy missions_delete on public.missions for delete using (public.is_admin());

-- company_addresses ------------------------------------------------------
alter table public.company_addresses enable row level security;
create policy company_addresses_all on public.company_addresses for all
  using (public.is_staff() or company_id = public.my_company_id())
  with check (public.is_staff() or company_id = public.my_company_id());

-- audit_log: 관리자만 읽기, 쓰기는 트리거만 ----------------------------------
alter table public.audit_log enable row level security;
create policy audit_log_select on public.audit_log for select using (public.is_admin());
