-- 사진 저장소(Storage) 버킷과 정책
-- 경로 규칙 (앱이 그대로 따른다)
--   order-photos : <order_id>/<phase>/<slot 또는 uuid>.jpg   (phase = pickup | dropoff | extra)
--   receipts     : <order_id>/<uuid>.jpg
--   driver-docs  : <driver_id>/<kind>.jpg                   (kind = license | insurance)

insert into storage.buckets(id, name, public) values
  ('order-photos', 'order-photos', false),
  ('receipts', 'receipts', false),
  ('driver-docs', 'driver-docs', false)
on conflict (id) do nothing;

-- 폴더 이름을 uuid로 바꾼다. uuid 모양이 아니면 null (정책이 거부하게 됨)
create function public.try_uuid(p text) returns uuid
language sql immutable as $$
  select case when p ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then p::uuid end
$$;

-- order-photos
create policy order_photos_files_select on storage.objects for select using (
  bucket_id = 'order-photos' and public.can_read_order(public.try_uuid((storage.foldername(name))[1]))
);
create policy order_photos_files_insert on storage.objects for insert with check (
  bucket_id = 'order-photos'
  and public.try_uuid((storage.foldername(name))[1]) is not null
  and (public.is_staff()
       or public.photo_phase_open(public.try_uuid((storage.foldername(name))[1]), (storage.foldername(name))[2]))
);
create policy order_photos_files_update on storage.objects for update using (
  bucket_id = 'order-photos'
  and (public.is_staff()
       or public.photo_phase_open(public.try_uuid((storage.foldername(name))[1]), (storage.foldername(name))[2]))
);
create policy order_photos_files_delete on storage.objects for delete using (
  bucket_id = 'order-photos' and public.is_staff()
);

-- receipts
create policy receipts_files_select on storage.objects for select using (
  bucket_id = 'receipts' and public.can_read_receipt(public.try_uuid((storage.foldername(name))[1]))
);
create policy receipts_files_insert on storage.objects for insert with check (
  bucket_id = 'receipts'
  and public.try_uuid((storage.foldername(name))[1]) is not null
  and (public.is_staff() or public.can_add_receipt(public.try_uuid((storage.foldername(name))[1])))
);
create policy receipts_files_delete on storage.objects for delete using (
  bucket_id = 'receipts' and public.is_staff()
);

-- driver-docs
create policy driver_docs_files_select on storage.objects for select using (
  bucket_id = 'driver-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
);
create policy driver_docs_files_insert on storage.objects for insert with check (
  bucket_id = 'driver-docs' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy driver_docs_files_update on storage.objects for update using (
  bucket_id = 'driver-docs' and (storage.foldername(name))[1] = auth.uid()::text
);
