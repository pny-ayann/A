-- 기사 수수료율을 profiles에서 따로 떼어 낸다.
-- profiles는 고객도 (자기 오더 기사 이름·전화 확인용으로) 읽을 수 있어서, 수수료율이 보이면 안 된다.
-- 관제는 모두 보고, 기사는 자기 것만 보고, 바꾸는 건 관리자만.

create table public.driver_rates (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  commission_rate numeric(5, 2) not null check (commission_rate >= 0 and commission_rate <= 100),
  updated_at timestamptz not null default now()
);

insert into public.driver_rates(driver_id, commission_rate)
select id, commission_rate from public.profiles where commission_rate is not null;

alter table public.profiles drop column commission_rate;

alter table public.driver_rates enable row level security;
create policy driver_rates_select on public.driver_rates for select using (driver_id = auth.uid() or public.is_staff());
create policy driver_rates_insert on public.driver_rates for insert with check (public.is_admin());
create policy driver_rates_update on public.driver_rates for update using (public.is_admin()) with check (public.is_admin());
create policy driver_rates_delete on public.driver_rates for delete using (public.is_admin());

create trigger audit_driver_rates after insert or update or delete on public.driver_rates
  for each row execute function public.audit_row();
