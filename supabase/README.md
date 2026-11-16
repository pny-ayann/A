# 서버(Supabase) 준비 안내

탁송 앱의 데이터(오더, 사진, 기사 위치 등)와 규칙이 들어가는 서버예요.
아직 만들지 않아도 돼요. 앱 화면을 만들고 실제로 연결할 때 이 순서대로 하면 돼요.
무료 요금제로 시작해요.

## 1. 무료 프로젝트 만들기

1. https://supabase.com 에 가입하고 로그인해요.
2. **New project**를 누르고 이름(예: `takson`), 데이터베이스 비밀번호, 지역 **Northeast Asia (Seoul)**을 골라요.
   - 데이터베이스 비밀번호는 따로 적어 두세요. GitHub나 채팅에 올리지 마세요.
3. 2~3분 기다리면 프로젝트가 준비돼요.

## 2. 규칙(마이그레이션) 넣기

`supabase/migrations` 폴더의 파일 7개를 **번호 순서대로** 넣어요.

1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. `20261116000001_schema.sql` 내용을 전부 복사해서 붙여 넣고 **Run**
3. 성공하면 다음 파일(`...0002`, `...0003`, ... `...0007`)도 같은 방법으로 하나씩 실행해요.
4. 중간에 빨간 오류가 나면 거기서 멈추고 오류 문구를 Claude에게 보여 주세요.

## 3. 첫 관리자 계정 만들기

로그인 아이디는 내부적으로 `아이디@takson.local` 이메일로 바뀌어 저장돼요.

1. 왼쪽 메뉴 **Authentication** → **Users** → **Add user** → **Create new user**
2. Email에 `원하는아이디@takson.local` (예: `boss@takson.local`), Password에 비밀번호를 넣고
   **Auto Confirm User**를 켠 뒤 만들어요.
3. **SQL Editor**에서 아래를 붙여 넣고, `boss`를 2번에서 쓴 아이디로 바꿔 **Run** 해요.

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"staff","staff_level":"admin"}'
where email = 'boss@takson.local';

update public.profiles
set role = 'staff', staff_level = 'admin', driver_status = null
where login_id = 'boss';
```

이제 이 계정으로 관제 웹에 로그인하면 관리자 권한을 가져요.
업체 계정, 기사 계정, 다른 관제 직원 계정은 관제 웹에서 만들어요.

## 4. 앱에 넣을 연결 정보

**Project Settings** → **API**에서 두 값을 확인해요.

| 값 | 어디에 쓰나 | 주의 |
|---|---|---|
| Project URL | 앱, 관제 웹 | 공개돼도 괜찮아요 |
| anon public key | 앱, 관제 웹 | 공개돼도 괜찮아요. 권한 규칙이 데이터를 지켜요 |
| service_role key | 관제 웹 서버(계정 만들기)에만 | **절대 공개 금지.** GitHub, 앱, 채팅에 올리지 마세요 |

## 개발자용 메모

- 테스트: 저장소 루트에서 `npm test`. Docker 없이 PGlite로 실제 마이그레이션을 돌려 검사해요.
- `supabase/tests/helpers/stubs.sql`은 테스트 전용 흉내 파일이에요. 실제 서버에는 넣지 않아요.
- 규칙 위반은 영문 코드(예: `ALREADY_TAKEN`)로 오류가 나요. 앱은 `@takson/shared`의 `errorMessage()`로 한국어 문구를 보여줘요.
