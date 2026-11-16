-- Supabase(GoTrue)는 관리자 API로 계정을 만들 때 auth.users를 먼저 넣고(app_metadata에 provider만),
-- 우리가 준 app_metadata(role 등)는 곧바로 UPDATE로 써 넣는다.
-- 그래서 INSERT 트리거만으로는 모든 계정이 '대기 중 기사'가 됐다.
-- app_metadata의 역할 관련 값이 바뀌면 프로필을 맞춘다. app_metadata는 서비스 키로만 바꿀 수 있어 믿을 수 있다.

create function public.sync_profile_from_app_meta() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  keys text[] := array['role', 'company_id', 'staff_level', 'driver_status', 'name', 'phone'];
  app jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_role text := app->>'role';
  k text;
  changed boolean := false;
begin
  if v_role is null then
    return new;
  end if;
  foreach k in array keys loop
    if (app->k) is distinct from (coalesce(old.raw_app_meta_data, '{}'::jsonb)->k) then
      changed := true;
    end if;
  end loop;
  if not changed then
    return new;
  end if;

  update public.profiles set
    role = v_role,
    company_id = case when v_role = 'customer' then nullif(app->>'company_id', '')::uuid end,
    staff_level = case when v_role = 'staff' then app->>'staff_level' end,
    driver_status = case when v_role = 'driver' then coalesce(app->>'driver_status', driver_status, 'pending') end,
    name = coalesce(app->>'name', name),
    phone = coalesce(app->>'phone', phone)
  where id = new.id;
  return new;
end $$;

create trigger on_auth_user_app_meta_updated
  after update of raw_app_meta_data on auth.users
  for each row execute function public.sync_profile_from_app_meta();

revoke execute on function public.sync_profile_from_app_meta() from public, anon, authenticated;
