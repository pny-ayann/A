-- 1단계 기본 테이블과 프로필 자동 생성
-- 설계: docs/superpowers/specs/2026-11-16-1단계-오더흐름-design.md

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  default_payment text not null default 'postpaid' check (default_payment in ('cash', 'postpaid')),
  fuel_billing text not null default 'customer' check (fuel_billing in ('customer', 'company')),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('driver', 'customer', 'staff')),
  login_id text not null unique,
  name text,
  phone text,
  company_id uuid references public.companies(id),
  staff_level text check (staff_level in ('admin', 'operator')),
  driver_status text check (driver_status in ('pending', 'active', 'suspended')),
  commission_rate numeric(5, 2),
  created_at timestamptz not null default now(),
  check (role <> 'customer' or company_id is not null),
  check (role <> 'staff' or staff_level is not null),
  check (role <> 'driver' or driver_status is not null)
);

create table public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('license', 'insurance')),
  path text not null,
  created_at timestamptz not null default now()
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  release_min_takson int not null default 10,
  release_min_daeri int not null default 5,
  reservation_gap_min int not null default 30,
  unassigned_alert_min int not null default 10
);
insert into public.settings default values;

create table public.fare_bands (
  id uuid primary key default gen_random_uuid(),
  max_km numeric not null unique,
  fare int not null check (fare >= 0),
  created_at timestamptz not null default now()
);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  extra_fare int not null default 0 check (extra_fare >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  created_by uuid references public.profiles(id) default auth.uid(),
  kind text not null default 'takson' check (kind in ('takson', 'daeri')),
  status text not null default 'open'
    check (status in ('open', 'assigned', 'arrived_pickup', 'driving', 'completed', 'cancelled')),
  dispatch_mode text not null default 'open' check (dispatch_mode in ('open', 'staff_only')),
  reserved_at timestamptz,
  pickup_address text not null,
  pickup_detail text,
  pickup_area text,
  pickup_lat double precision,
  pickup_lng double precision,
  pickup_contact_name text,
  pickup_contact_phone text,
  dropoff_address text not null,
  dropoff_detail text,
  dropoff_area text,
  dropoff_lat double precision,
  dropoff_lng double precision,
  dropoff_contact_name text,
  dropoff_contact_phone text,
  vehicle_number text,
  vehicle_model text,
  vehicle_color text,
  transmission text check (transmission in ('auto', 'manual')),
  driver_memo text,
  payment_method text not null check (payment_method in ('cash', 'postpaid')),
  fare int not null check (fare >= 0),
  distance_km numeric,
  driver_id uuid references public.profiles(id),
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_status_idx on public.orders(status);
create index orders_company_idx on public.orders(company_id);
create index orders_driver_idx on public.orders(driver_id);

create table public.order_waypoints (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  seq int not null,
  address text not null,
  detail text,
  area text,
  lat double precision,
  lng double precision,
  contact_name text,
  contact_phone text,
  created_at timestamptz not null default now()
);

create table public.order_missions (
  order_id uuid not null references public.orders(id) on delete cascade,
  mission_id uuid not null references public.missions(id),
  extra_fare int not null,
  created_at timestamptz not null default now(),
  primary key (order_id, mission_id)
);

create table public.order_photos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  phase text not null check (phase in ('pickup', 'dropoff', 'extra')),
  slot text check (slot in ('front', 'back', 'left', 'right', 'dashboard')),
  path text not null,
  taken_at timestamptz,
  lat double precision,
  lng double precision,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (order_id, phase, slot),
  check ((phase = 'extra') = (slot is null))
);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid,
  type text not null,
  from_status text,
  to_status text,
  reason text,
  data jsonb,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events(order_id);

create table public.company_addresses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  address text not null,
  detail text not null default '',
  area text,
  lat double precision,
  lng double precision,
  contact_name text,
  contact_phone text,
  use_count int not null default 0,
  pinned boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, address, detail)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  table_name text not null,
  row_id uuid,
  action text not null,
  old_row jsonb,
  new_row jsonb,
  created_at timestamptz not null default now()
);

-- 새 로그인 계정이 생기면 프로필을 만든다.
-- app_metadata는 서비스 키로만 넣을 수 있으므로, role은 app_metadata에서만 믿는다.
-- 스스로 가입한 계정은 무조건 '대기 중 기사'가 된다.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  app jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  usr jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text;
begin
  if app ? 'role' then
    v_role := app->>'role';
    insert into public.profiles(id, role, login_id, name, phone, company_id, staff_level, driver_status)
    values (
      new.id, v_role, split_part(new.email, '@', 1),
      coalesce(app->>'name', usr->>'name'), coalesce(app->>'phone', usr->>'phone'),
      nullif(app->>'company_id', '')::uuid,
      case when v_role = 'staff' then app->>'staff_level' end,
      case when v_role = 'driver' then coalesce(app->>'driver_status', 'pending') end
    );
  else
    insert into public.profiles(id, role, login_id, name, phone, driver_status)
    values (new.id, 'driver', split_part(new.email, '@', 1), usr->>'name', usr->>'phone', 'pending');
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
