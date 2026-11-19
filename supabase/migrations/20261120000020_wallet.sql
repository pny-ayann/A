-- 2단계-1 기사 충전금 장부와 완료 오더 자동 정산
-- 돈은 wallet_entries에 한 줄씩 쌓고 잔액은 합으로만 구한다(잔액 칸 없음).
-- 오더 정산: "이 오더가 지금 상태라면 기사별로 얼마여야 하나" − 이미 적힌 합 = 차이만 한 줄.

alter table public.settings
  add column default_commission_rate numeric(5, 2) not null default 20
    check (default_commission_rate >= 0 and default_commission_rate <= 100),
  add column settlement_start_at timestamptz; -- null = 정산 꺼짐

alter table public.orders add column completed_at timestamptz;

create table public.wallet_entries (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null check (amount <> 0),
  kind text not null check (kind in ('postpaid', 'cash_fee', 'settle_adjust', 'fuel', 'fuel_adjust',
                                     'opening', 'topup', 'adjust', 'withdraw', 'withdraw_reject')),
  label text not null,
  order_id uuid references public.orders(id) on delete set null,
  rate numeric(5, 2),
  reason text,
  ref_id uuid,
  effective_at timestamptz not null default now(),
  withdrawable_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default clock_timestamp()
);
create index wallet_entries_driver on public.wallet_entries(driver_id, effective_at);
create index wallet_entries_order on public.wallet_entries(order_id, driver_id);

alter table public.wallet_entries enable row level security;
create policy wallet_entries_select on public.wallet_entries for select
  using (driver_id = auth.uid() or public.is_staff());
-- 쓰기 정책 없음: 정의자 함수와 트리거만 쓴다

-- 완료 시각: 완료가 되면 (비어 있으면) 지금, 완료에서 벗어나면 지운다 --------------------
create function public.orders_completed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status <> 'completed' then
      if tg_op = 'INSERT' or new.completed_at is not distinct from old.completed_at then
        new.completed_at := coalesce(new.completed_at, now());
      end if;
      if tg_op = 'UPDATE' and new.completed_at is null then new.completed_at := now(); end if;
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;
create trigger orders_completed_at before insert or update on public.orders
  for each row execute function public.orders_completed_at();

-- 한국 날짜 다음 날 12:00
create function public.next_noon_kst(p timestamptz) returns timestamptz
language sql immutable as $$
  select (((p at time zone 'Asia/Seoul')::date + 1) + time '12:00') at time zone 'Asia/Seoul'
$$;

create function public.settle_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  v_start timestamptz;
  v_default numeric;
  d uuid;
  v_target int;
  v_current int;
  v_rate numeric;
  v_anchor public.wallet_entries;
  v_fee int;
  v_kind text;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then return; end if;
  select settlement_start_at, default_commission_rate into v_start, v_default from public.settings where id = 1;

  -- 이 오더와 관련된 기사: 지금 기사 + 장부에 이미 정산 줄이 있는 기사
  for d in
    select o.driver_id where o.driver_id is not null
    union
    select distinct driver_id from public.wallet_entries
    where order_id = p_order_id and kind in ('postpaid', 'cash_fee', 'settle_adjust')
  loop
    select coalesce(sum(amount), 0) into v_current from public.wallet_entries
    where order_id = p_order_id and driver_id = d and kind in ('postpaid', 'cash_fee', 'settle_adjust');

    -- 비율: 이 오더·기사의 첫 정산 줄 비율 → 기사 비율 → 회사 기본
    select rate into v_rate from public.wallet_entries
    where order_id = p_order_id and driver_id = d and rate is not null
    order by created_at limit 1;
    if v_rate is null then
      select commission_rate into v_rate from public.driver_rates where driver_id = d;
    end if;
    v_rate := coalesce(v_rate, v_default);

    v_target := 0;
    if o.status = 'completed' and d = o.driver_id and v_start is not null
       and o.completed_at is not null and o.completed_at >= v_start and o.fare > 0 then
      v_fee := round(o.fare * v_rate / 100);
      v_target := case when o.payment_method = 'postpaid' then o.fare - v_fee else -v_fee end;
    end if;

    if v_target = v_current then continue; end if;

    if v_current = 0 then
      -- 새로 정산: 시각을 지금 완료 기준으로
      v_kind := case when o.payment_method = 'postpaid' then 'postpaid' else 'cash_fee' end;
      insert into public.wallet_entries(driver_id, amount, kind, label, order_id, rate, effective_at, withdrawable_at, created_by)
      values (d, v_target, v_kind,
              case when v_kind = 'postpaid' then '후불 오더 완료 (' else '현금 오더 수수료 (' end || o.order_no || ')',
              p_order_id, v_rate,
              case when v_kind = 'postpaid' then o.completed_at + interval '10 minutes' else o.completed_at end,
              case when v_kind = 'postpaid' then public.next_noon_kst(o.completed_at) end,
              auth.uid());
    else
      -- 차이: 가장 최근 새 정산 줄과 같은 시각 (되돌려도 잔액이 잠깐 마이너스가 되지 않게)
      select * into v_anchor from public.wallet_entries
      where order_id = p_order_id and driver_id = d and kind in ('postpaid', 'cash_fee')
      order by created_at desc limit 1;
      insert into public.wallet_entries(driver_id, amount, kind, label, order_id, rate, effective_at, withdrawable_at, created_by)
      values (d, v_target - v_current, 'settle_adjust', '정산 변경 (' || o.order_no || ')', p_order_id, v_rate,
              v_anchor.effective_at, v_anchor.withdrawable_at, auth.uid());
    end if;
  end loop;
end $$;
revoke execute on function public.settle_order(uuid) from public, anon, authenticated;

create function public.orders_settle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status or new.fare is distinct from old.fare
     or new.driver_id is distinct from old.driver_id or new.payment_method is distinct from old.payment_method
     or new.completed_at is distinct from old.completed_at then
    perform public.settle_order(new.id);
  end if;
  return null;
end $$;
revoke execute on function public.orders_settle() from public, anon, authenticated;
create trigger orders_settle after update on public.orders
  for each row execute function public.orders_settle();

-- 잔액 세 가지 -------------------------------------------------------------------
-- balance: 들어온 줄의 합 / pending: 아직 안 들어온 줄의 합
-- withdrawable: balance − (들어왔지만 아직 출금 가능 시각 전인 줄의 합, 0 이상)
create function public.wallet_summary(p_driver uuid default auth.uid(), p_at timestamptz default now())
returns table(balance int, withdrawable int, pending int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_bal bigint;
  v_pending bigint;
  v_locked bigint;
begin
  if auth.uid() is not null and p_driver is distinct from auth.uid() and not public.is_staff() then
    raise exception 'FORBIDDEN';
  end if;
  select coalesce(sum(amount) filter (where effective_at <= p_at), 0),
         coalesce(sum(amount) filter (where effective_at > p_at), 0),
         coalesce(sum(amount) filter (where effective_at <= p_at and withdrawable_at > p_at), 0)
    into v_bal, v_pending, v_locked
  from public.wallet_entries where driver_id = p_driver;
  balance := v_bal;
  pending := v_pending;
  withdrawable := greatest(0, v_bal - greatest(0, v_locked));
  return next;
end $$;
