-- 2단계-1: 마이너스 배차 막기, 받을 계좌, 출금 신청·처리, 관리자 충전·조정·시작 잔액
-- 계좌와 출금 신청은 본인과 관리자만 본다. 장부 쓰기는 모두 아래 함수로만.

-- 정산이 켜져 있고 잔액이 마이너스인가
create function public.wallet_negative(p_driver uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select settlement_start_at is not null from public.settings where id = 1)
     and coalesce((select balance from public.wallet_summary(p_driver)), 0) < 0
$$;
revoke execute on function public.wallet_negative(uuid) from public, anon, authenticated;

-- 기사 잡기 (0004 본문 + 마이너스 검사)
create or replace function public.claim_order(p_order_id uuid, p_lat double precision default null,
                                              p_lng double precision default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_conflicts text[];
begin
  if not public.is_active_driver() then raise exception 'DRIVER_NOT_ACTIVE'; end if;
  -- 같은 기사의 동시 잡기를 한 줄로 세운다
  perform 1 from public.profiles where id = auth.uid() for update;
  if public.wallet_negative(auth.uid()) then raise exception 'BALANCE_NEGATIVE'; end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.dispatch_mode <> 'open' then raise exception 'NOT_OPEN'; end if;
  if v_order.status in ('assigned', 'arrived_pickup', 'driving') then raise exception 'ALREADY_TAKEN'; end if;
  if v_order.status <> 'open' then raise exception 'NOT_OPEN'; end if;

  v_conflicts := public.driver_conflicts(auth.uid(), v_order.reserved_at, p_order_id);
  if cardinality(v_conflicts) > 0 then raise exception '%', v_conflicts[1]; end if;

  perform public.set_rpc_context(null, p_lat, p_lng);
  update public.orders set status = 'assigned', driver_id = auth.uid(), assigned_at = now()
  where id = p_order_id and status = 'open' and dispatch_mode = 'open';
  if not found then raise exception 'ALREADY_TAKEN'; end if;
end $$;

-- 관제 배정 (0005 본문 + 마이너스 검사)
create or replace function public.staff_assign(p_order_id uuid, p_driver_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_warnings text[];
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_order.status not in ('open', 'assigned') then raise exception 'INVALID_TRANSITION'; end if;
  if not exists (select 1 from public.profiles where id = p_driver_id and role = 'driver' and driver_status = 'active') then
    raise exception 'DRIVER_NOT_ACTIVE';
  end if;
  if public.wallet_negative(p_driver_id) then raise exception 'BALANCE_NEGATIVE'; end if;

  v_warnings := public.driver_conflicts(p_driver_id, v_order.reserved_at, p_order_id);
  perform public.set_rpc_context(null, null, null);
  update public.orders set status = 'assigned', driver_id = p_driver_id, assigned_at = now() where id = p_order_id;
  if v_order.driver_id is not null and v_order.driver_id <> p_driver_id then
    insert into public.order_events(order_id, actor_id, type, data)
    values (p_order_id, auth.uid(), 'reassigned', jsonb_build_object('from', v_order.driver_id, 'to', p_driver_id));
  end if;
  return v_warnings;
end $$;

-- 받을 계좌 ---------------------------------------------------------------------
create table public.bank_accounts (
  driver_id uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  bank text not null check (length(trim(bank)) > 0),
  number text not null check (length(trim(number)) > 0),
  holder text not null check (length(trim(holder)) > 0),
  updated_at timestamptz not null default now()
);
alter table public.bank_accounts enable row level security;
create policy bank_accounts_select on public.bank_accounts for select using (driver_id = auth.uid() or public.is_admin());
create policy bank_accounts_insert on public.bank_accounts for insert with check (driver_id = auth.uid());
create policy bank_accounts_update on public.bank_accounts for update using (driver_id = auth.uid()) with check (driver_id = auth.uid());

-- 출금 신청 ---------------------------------------------------------------------
create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null check (amount > 0),
  status text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  bank text not null,
  number text not null,
  holder text not null,
  -- 나중 자동 송금(펌뱅킹) 자리
  method text not null default 'manual' check (method in ('manual', 'auto')),
  external_ref text,
  fail_reason text,
  memo text,
  reason text,
  entry_id uuid references public.wallet_entries(id),
  processed_by uuid references public.profiles(id),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index withdrawal_requests_status on public.withdrawal_requests(status, created_at);
alter table public.withdrawal_requests enable row level security;
create policy withdrawal_requests_select on public.withdrawal_requests for select
  using (driver_id = auth.uid() or public.is_admin());

create function public.request_withdrawal(p_amount int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_acc public.bank_accounts;
  v_free int;
  v_entry uuid;
  v_id uuid;
begin
  if public.my_role() is distinct from 'driver' then raise exception 'FORBIDDEN'; end if;
  -- 같은 기사의 동시 신청을 한 줄로 세운다
  perform 1 from public.profiles where id = auth.uid() for update;
  if (select settlement_start_at is null from public.settings where id = 1) then raise exception 'SETTLEMENT_OFF'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'INVALID_AMOUNT'; end if;
  select * into v_acc from public.bank_accounts where driver_id = auth.uid();
  if not found then raise exception 'NO_BANK_ACCOUNT'; end if;
  select withdrawable into v_free from public.wallet_summary(auth.uid());
  if p_amount > v_free then raise exception 'OVER_WITHDRAWABLE'; end if;

  insert into public.wallet_entries(driver_id, amount, kind, label)
  values (auth.uid(), -p_amount, 'withdraw', '출금 신청') returning id into v_entry;
  insert into public.withdrawal_requests(driver_id, amount, bank, number, holder, entry_id)
  values (auth.uid(), p_amount, v_acc.bank, v_acc.number, v_acc.holder, v_entry) returning id into v_id;
  update public.wallet_entries set ref_id = v_id where id = v_entry;
  return v_id;
end $$;

create function public.process_withdrawal(p_id uuid, p_result text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.withdrawal_requests;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into r from public.withdrawal_requests where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.status <> 'requested' then raise exception 'ALREADY_PROCESSED'; end if;

  if p_result = 'paid' then
    update public.withdrawal_requests
    set status = 'paid', memo = nullif(trim(coalesce(p_note, '')), ''), processed_by = auth.uid(), processed_at = now()
    where id = p_id;
    perform public.send_push(array[r.driver_id], '출금 완료', public.won_text(r.amount), jsonb_build_object('screen', 'wallet'));
  elsif p_result = 'rejected' then
    if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'REASON_REQUIRED'; end if;
    insert into public.wallet_entries(driver_id, amount, kind, label, reason, ref_id)
    values (r.driver_id, r.amount, 'withdraw_reject', '출금 거절: ' || trim(p_note), trim(p_note), p_id);
    update public.withdrawal_requests
    set status = 'rejected', reason = trim(p_note), processed_by = auth.uid(), processed_at = now()
    where id = p_id;
    perform public.send_push(array[r.driver_id], '출금 거절', public.won_text(r.amount) || ' · ' || trim(p_note),
      jsonb_build_object('screen', 'wallet'));
  else
    raise exception 'INVALID_TRANSITION';
  end if;
end $$;

-- 관리자 충전·조정·시작 잔액 --------------------------------------------------------
create function public.admin_wallet_entry(p_driver uuid, p_kind text, p_amount int, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
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
end $$;

create function public.start_settlement(p_openings jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  x jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if (select settlement_start_at is not null from public.settings where id = 1) then raise exception 'INVALID_TRANSITION'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_openings, '[]'::jsonb)) loop
    if coalesce((x->>'amount')::int, 0) <> 0 then
      perform public.admin_wallet_entry((x->>'driver_id')::uuid, 'opening', (x->>'amount')::int, null);
    end if;
  end loop;
  update public.settings set settlement_start_at = now() where id = 1;
end $$;
