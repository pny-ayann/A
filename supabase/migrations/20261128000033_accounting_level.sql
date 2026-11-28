-- 직원 등급 '정산'(accounting): 관제 + 충전금·출금 신청·업체 정산·업체 관리·기사 관리(상태·수수료).
-- 직원 계정·요금표·미션·캐피탈 예시·운영 설정·변경 기록·업체 삭제는 지금처럼 관리자만.

-- 1. 등급 추가 ---------------------------------------------------------------------------
alter table public.profiles drop constraint profiles_staff_level_check;
alter table public.profiles add constraint profiles_staff_level_check
  check (staff_level in ('admin', 'operator', 'accounting'));

-- 2. 관리자 또는 정산 ---------------------------------------------------------------------
create function public.can_settle() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and staff_level in ('admin', 'accounting'))
$$;
revoke execute on function public.can_settle() from public, anon;
grant execute on function public.can_settle() to authenticated;

-- 3. 정산 함수: 관리자 검사 → 관리자 또는 정산 (본문은 지금 정의 그대로) ---------------------------
CREATE OR REPLACE FUNCTION public.admin_wallet_entry(p_driver uuid, p_kind text, p_amount integer, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_id uuid;
begin
  if not public.can_settle() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.profiles where id = p_driver and role = 'driver') then raise exception 'NOT_FOUND'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_kind = 'topup' then
    if p_amount < 0 then raise exception 'INVALID_AMOUNT'; end if;
    insert into public.wallet_entries(driver_id, amount, kind, label, reason)
    values (p_driver, p_amount, 'topup', '충전', v_reason) returning id into v_id;
  elsif p_kind = 'adjust' then
    if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
    insert into public.wallet_entries(driver_id, amount, kind, label, reason)
    values (p_driver, p_amount, 'adjust', '조정: ' || v_reason, v_reason) returning id into v_id;
  elsif p_kind = 'opening' then
    if exists (select 1 from public.wallet_entries where driver_id = p_driver and kind = 'opening') then
      raise exception 'INVALID_TRANSITION';
    end if;
    insert into public.wallet_entries(driver_id, amount, kind, label)
    values (p_driver, p_amount, 'opening', '시작 잔액') returning id into v_id;
  else
    raise exception 'INVALID_TRANSITION';
  end if;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.billing_lines(p_company uuid, p_month date)
 RETURNS TABLE(order_id uuid, order_no text, completed_at timestamp with time zone, pickup_area text, dropoff_area text, vehicle_number text, missions text, fare integer, fuel integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_settle() then raise exception 'FORBIDDEN'; end if;
  return query
    select l.order_id, l.order_no, l.completed_at, l.pickup_area, l.dropoff_area, l.vehicle_number, l.missions, l.fare, l.fuel
    from public.billing_lines_all(p_month) l where l.company_id = p_company
    order by l.completed_at, l.order_no;
end $function$
;

CREATE OR REPLACE FUNCTION public.billing_receivables()
 RETURNS TABLE(company_id uuid, company_name text, month date, total integer, paid_amount integer, due integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_m date;
begin
  if not public.can_settle() then raise exception 'FORBIDDEN'; end if;
  for v_m in
    select distinct date_trunc('month', o.completed_at at time zone 'Asia/Seoul')::date
      from public.orders o
      where o.payment_method = 'postpaid' and o.status = 'completed' and o.completed_at is not null
    union
    select p.month from public.company_payments p
    order by 1
  loop
    continue when v_m >= v_now;
    return query
      select s.company_id, s.company_name, v_m, s.total, s.paid_amount, s.total - coalesce(s.paid_amount, 0)
      from public.billing_summary(v_m) s
      where s.total - coalesce(s.paid_amount, 0) > 0;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.billing_summary(p_month date)
 RETURNS TABLE(company_id uuid, company_name text, supply integer, vat integer, fuel integer, total integer, paid_amount integer, paid_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_month date := date_trunc('month', p_month)::date;
begin
  if not public.can_settle() then raise exception 'FORBIDDEN'; end if;
  return query
    select c.id, c.name, coalesce(t.supply, 0), coalesce(t.vat, 0), coalesce(t.fuel, 0), coalesce(t.total, 0),
           p.amount, p.checked_at
    from public.billing_totals(v_month) t
    full join (select * from public.company_payments where month = v_month) p on p.company_id = t.company_id
    join public.companies c on c.id = coalesce(t.company_id, p.company_id)
    order by c.name;
end $function$
;

CREATE OR REPLACE FUNCTION public.billing_totals(p_month date)
 RETURNS TABLE(company_id uuid, company_name text, supply integer, vat integer, fuel integer, total integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_settle() then raise exception 'FORBIDDEN'; end if;
  return query
    with s as (
      select l.company_id, sum(l.fare)::int as supply, sum(l.fuel)::int as fuel
      from public.billing_lines_all(p_month) l group by l.company_id
    )
    select s.company_id, c.name, s.supply, s.supply / 10, s.fuel, s.supply + s.supply / 10 + s.fuel  -- 10% 버림 (supply*10은 2.15억에서 넘침)
    from s join public.companies c on c.id = s.company_id
    order by c.name;
end $function$
;

CREATE OR REPLACE FUNCTION public.process_withdrawal(p_id uuid, p_result text, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.withdrawal_requests;
begin
  if not public.can_settle() then raise exception 'FORBIDDEN'; end if;
  select * into r from public.withdrawal_requests where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.status <> 'requested' then raise exception 'ALREADY_PROCESSED'; end if;

  if p_result = 'paid' then
    update public.withdrawal_requests
    set status = 'paid', memo = nullif(trim(coalesce(p_note, '')), ''), processed_by = auth.uid(), processed_at = now()
    where id = p_id;
    begin
      perform public.send_push(array[r.driver_id], '출금 완료', public.won_text(r.amount), jsonb_build_object('screen', 'wallet'));
    exception when others then
      raise warning 'withdrawal push failed: %', sqlerrm;
    end;
  elsif p_result = 'rejected' then
    if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'REASON_REQUIRED'; end if;
    insert into public.wallet_entries(driver_id, amount, kind, label, reason, ref_id)
    values (r.driver_id, r.amount, 'withdraw_reject', '출금 거절: ' || trim(p_note), trim(p_note), p_id);
    update public.withdrawal_requests
    set status = 'rejected', reason = trim(p_note), processed_by = auth.uid(), processed_at = now()
    where id = p_id;
    begin
      perform public.send_push(array[r.driver_id], '출금 거절', public.won_text(r.amount) || ' · ' || trim(p_note),
        jsonb_build_object('screen', 'wallet'));
    exception when others then
      raise warning 'withdrawal push failed: %', sqlerrm;
    end;
  else
    raise exception 'INVALID_TRANSITION';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_company_paid(p_company uuid, p_month date, p_paid boolean, p_expected integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_total int;
begin
  if not public.can_settle() then raise exception 'FORBIDDEN'; end if;
  if not p_paid then
    delete from public.company_payments where company_id = p_company and month = v_month;
    return;
  end if;
  select coalesce((select t.total from public.billing_totals(v_month) t where t.company_id = p_company), 0) into v_total;
  if v_total is distinct from p_expected then raise exception 'AMOUNT_CHANGED'; end if;
  insert into public.company_payments(company_id, month, amount) values (p_company, v_month, v_total)
  on conflict (company_id, month) do update
    set amount = excluded.amount, checked_at = now(), checked_by = auth.uid();
end $function$
;

CREATE OR REPLACE FUNCTION public.start_settlement(p_openings jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  x jsonb;
begin
  if not public.can_settle() then raise exception 'FORBIDDEN'; end if;
  -- 두 관리자가 동시에 눌러도 한 번만 (설정 줄을 잠그고 확인)
  perform 1 from public.settings where id = 1 for update;
  if (select settlement_start_at is not null from public.settings where id = 1) then raise exception 'INVALID_TRANSITION'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_openings, '[]'::jsonb)) loop
    if coalesce((x->>'amount')::int, 0) <> 0 then
      perform public.admin_wallet_entry((x->>'driver_id')::uuid, 'opening', (x->>'amount')::int, null);
    end if;
  end loop;
  update public.settings set settlement_start_at = now() where id = 1;
end $function$
;

-- 4. 정산이 읽고 고치는 표 ---------------------------------------------------------------------
drop policy companies_admin_insert on public.companies;
create policy companies_admin_insert on public.companies for insert with check ((select public.can_settle()));
drop policy companies_admin_update on public.companies;
create policy companies_admin_update on public.companies for update using ((select public.can_settle())) with check ((select public.can_settle()));

drop policy driver_rates_insert on public.driver_rates;
create policy driver_rates_insert on public.driver_rates for insert with check ((select public.can_settle()));
drop policy driver_rates_update on public.driver_rates;
create policy driver_rates_update on public.driver_rates for update using ((select public.can_settle())) with check ((select public.can_settle()));
drop policy driver_rates_delete on public.driver_rates;
create policy driver_rates_delete on public.driver_rates for delete using ((select public.can_settle()));

drop policy bank_accounts_select on public.bank_accounts;
create policy bank_accounts_select on public.bank_accounts for select to authenticated
  using (driver_id = (select auth.uid()) or (select public.can_settle()));
drop policy withdrawal_requests_select on public.withdrawal_requests;
create policy withdrawal_requests_select on public.withdrawal_requests for select to authenticated
  using (driver_id = (select auth.uid()) or (select public.can_settle()));
drop policy company_payments_select on public.company_payments;
create policy company_payments_select on public.company_payments for select to authenticated using ((select public.can_settle()));

-- 5. 기사 계정: 정산은 기사 프로필만 고친다 (역할·등급·업체는 못 바꿈) ---------------------------------
create policy profiles_update_settle on public.profiles for update
  using ((select public.can_settle()) and role = 'driver') with check ((select public.can_settle()) and role = 'driver');

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  -- 정산: 기사의 이름·전화·상태만
  if public.can_settle() and old.role = 'driver'
     and (to_jsonb(new) - 'name' - 'phone' - 'driver_status') is not distinct from (to_jsonb(old) - 'name' - 'phone' - 'driver_status') then
    return new;
  end if;
  if (to_jsonb(new) - 'name' - 'phone') is distinct from (to_jsonb(old) - 'name' - 'phone') then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end $$;
