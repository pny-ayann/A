-- 2026-11-28 점검(데이터베이스·보안·숨은 오류)에서 나온 돈·운행 구멍 막기
-- 이미 서버에 있는 값이 규칙을 어겨도 올리기가 실패하지 않게, 새 검사는 not valid(앞으로 넣는 값만 검사)로 건다.

-- 1. 요금 ---------------------------------------------------------------------------------
-- 한 오더 요금 상한 100만 원 (엉뚱한 값이 정산·업체 청구 합계를 깨지 않게)
alter table public.orders add constraint orders_fare_max check (fare <= 1000000) not valid;

-- 배정 뒤 고객 변경 요청으로는 요금을 낮출 수 없다 (낮추는 건 관제가 한다)
create or replace function public.customer_amend_fare_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_setting('app.amend', true) = 'on' and new.fare < old.fare then
    raise exception 'FARE_DECREASE';
  end if;
  return new;
end $$;
revoke execute on function public.customer_amend_fare_guard() from public, anon, authenticated;
create trigger customer_amend_fare_guard before update of fare on public.orders
  for each row execute function public.customer_amend_fare_guard();

-- 2. 돈 기록이 있는 기사는 지울 수 없다 (지우면 장부·출금 신청이 흔적 없이 사라졌다) --------
alter table public.wallet_entries drop constraint wallet_entries_driver_id_fkey,
  add constraint wallet_entries_driver_id_fkey foreign key (driver_id) references public.profiles(id) on delete restrict;
alter table public.withdrawal_requests drop constraint withdrawal_requests_driver_id_fkey,
  add constraint withdrawal_requests_driver_id_fkey foreign key (driver_id) references public.profiles(id) on delete restrict;

-- 시작 잔액은 기사마다 한 번만 (두 관리자가 동시에 눌러도)
create unique index wallet_entries_one_opening on public.wallet_entries(driver_id) where kind = 'opening';

-- 3. 주유 영수증 ----------------------------------------------------------------------------
-- 한 장 50만 원까지 (기사가 큰 금액을 적어 업체 청구서에 그대로 들어가지 않게)
alter table public.fuel_receipts add constraint fuel_receipts_amount_max check (amount <= 500000) not valid;

-- 관제가 넣는 영수증 주인은 그 오더의 기사여야 한다 (아무 기사 앞으로 넣어 충전금을 올리지 못하게)
-- (기사는 이미 규칙상 자기 오더에 자기 이름으로만 넣는다)
create or replace function public.fuel_receipts_driver_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_staff() and (tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id) then
    if not exists (select 1 from public.orders where id = new.order_id and driver_id = new.driver_id) then
      raise exception 'RECEIPT_DRIVER';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.fuel_receipts_driver_guard() from public, anon, authenticated;
create trigger fuel_receipts_driver_guard before insert or update on public.fuel_receipts
  for each row execute function public.fuel_receipts_driver_guard();

-- 4. 오더를 놓거나 회수하면 앞 기사가 찍은 출발 사진·서류를 지운다 ----------------------------
-- (남아 있으면 다음 기사가 사진·서류 확인 없이 바로 출발할 수 있었다. 운행 중 교대는 그대로 둔다)
create or replace function public.orders_clear_handover() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.driver_id is not null and new.driver_id is distinct from old.driver_id
     and new.status in ('open', 'assigned') then
    delete from public.order_photos where order_id = new.id and phase <> 'dropoff';
    delete from public.order_documents where order_id = new.id;
  end if;
  return null;
end $$;
revoke execute on function public.orders_clear_handover() from public, anon, authenticated;
create trigger orders_clear_handover after update of driver_id on public.orders
  for each row execute function public.orders_clear_handover();

-- 5. 출금 처리: 알림이 실패해도 처리 결과는 남긴다 ---------------------------------------------
create or replace function public.process_withdrawal(p_id uuid, p_result text, p_note text) returns void
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
end $$;

-- 6. 푸시 토큰: 가입 대기 중인 기사는 남이 쓰던 토큰을 가져갈 수 없다 ---------------------------
create or replace function public.claim_push_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_LOGGED_IN';
  end if;
  if p_token is null or btrim(p_token) = '' then
    raise exception 'INVALID_TOKEN';
  end if;
  if exists (select 1 from public.push_tokens where token = p_token and user_id <> v_uid)
     and exists (select 1 from public.profiles where id = v_uid and role = 'driver' and driver_status <> 'active') then
    raise exception 'TOKEN_IN_USE';
  end if;
  delete from public.push_tokens where token = p_token and user_id <> v_uid;
  insert into public.push_tokens(user_id, token, updated_at) values (v_uid, p_token, now())
  on conflict (user_id, token) do update set updated_at = excluded.updated_at;
end $$;

-- 7. 사진 저장소: jpg 5MB까지 (아무나 가입해 큰 파일로 무료 용량을 채우지 못하게) ----------------
update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg']
where id in ('order-photos', 'receipts', 'driver-docs'); -- capital-examples는 관리자만 올리고 png도 받으니 그대로

-- 8. 자주 찾는 칸에 색인 (오더가 쌓여도 느려지지 않게) -------------------------------------------
create index if not exists order_waypoints_order on public.order_waypoints(order_id, seq);
create index if not exists withdrawal_requests_driver on public.withdrawal_requests(driver_id);
create index if not exists push_tokens_token on public.push_tokens(token);
create index if not exists profiles_company on public.profiles(company_id);

-- 9. 접근 규칙(RLS) 속도: 내 역할·업체·아이디 함수를 줄마다가 아니라 한 번만 계산하게 (select ...)로 감싼다 ---
-- (Supabase 권장 방식. 규칙의 뜻은 그대로고 계산 횟수만 줄어든다)
do $$
declare
  r record;
  v_q text;
  v_c text;
  v_pat constant text := '(public\.)?\m(is_admin|is_staff|my_company_id|my_role)\(\)';
begin
  for r in select schemaname, tablename, policyname, qual, with_check from pg_policies
           where schemaname in ('public', 'storage') loop
    v_q := regexp_replace(regexp_replace(r.qual, v_pat, '(select public.\2())', 'g'), '\mauth\.uid\(\)', '(select auth.uid())', 'g');
    v_c := regexp_replace(regexp_replace(r.with_check, v_pat, '(select public.\2())', 'g'), '\mauth\.uid\(\)', '(select auth.uid())', 'g');
    if v_q is distinct from r.qual or v_c is distinct from r.with_check then
      execute format('alter policy %I on %I.%I%s%s', r.policyname, r.schemaname, r.tablename,
        case when v_q is not null then format(' using (%s)', v_q) else '' end,
        case when v_c is not null then format(' with check (%s)', v_c) else '' end);
    end if;
  end loop;
end $$;
