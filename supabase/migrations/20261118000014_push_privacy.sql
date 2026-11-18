-- 푸시 개인정보 보호
-- ① 한 휴대폰(토큰)은 한 사람만: 앞사람이 오프라인에서 로그아웃해 줄이 남아도,
--    다음 사람이 로그인하면 그 토큰의 다른 사람 줄을 지우고 지금 사람 것으로 등록한다.
--    (RLS 때문에 앱에서는 남의 줄을 지울 수 없어서 security definer 함수로 한다)
-- ② 관제 메시지 알림에 채팅 글을 넣지 않는다 (잠금화면에 그대로 보이므로)

create function public.claim_push_token(p_token text) returns void
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
  delete from public.push_tokens where token = p_token and user_id <> v_uid;
  insert into public.push_tokens(user_id, token, updated_at) values (v_uid, p_token, now())
  on conflict (user_id, token) do update set updated_at = excluded.updated_at;
end $$;

revoke execute on function public.claim_push_token(text) from public, anon;
grant execute on function public.claim_push_token(text) to authenticated;

create or replace function public.messages_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_driver uuid;
begin
  begin
    if new.thread = 'driver' and exists (select 1 from public.profiles where id = new.sender_id and role = 'staff') then
      select driver_id into v_driver from public.orders where id = new.order_id;
      if v_driver is not null then
        perform public.send_push(array[v_driver], '관제 메시지', '관제에서 메시지가 왔어요',
          jsonb_build_object('orderId', new.order_id, 'screen', 'chat'));
      end if;
    end if;
  exception when others then
    raise warning 'messages_push failed: %', sqlerrm;
  end;
  return null;
end $$;

revoke execute on function public.messages_push() from public, anon, authenticated;
