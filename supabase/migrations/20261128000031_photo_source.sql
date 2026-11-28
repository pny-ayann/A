-- 사진을 앱 카메라로 찍었는지, 휴대폰 갤러리에서 골랐는지 (관제가 보고 판단).
-- 갤러리 사진은 찍은 시각·위치를 믿을 수 없다.
alter table public.order_photos
  add column source text not null default 'camera' check (source in ('camera', 'gallery'));
alter table public.order_documents
  add column source text not null default 'camera' check (source in ('camera', 'gallery'));
