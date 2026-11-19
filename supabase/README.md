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

**쉬운 방법 (명령어)**: 터미널에서 `npx supabase login`을 한 번 하고 나면 Claude가
`npx supabase link`와 `npm run db:push`로 한꺼번에 넣어 줄 수 있어요.
그다음 `npm run seed:dev`로 개발용 계정(dev_admin, dev_op, dev_cust_a, dev_cust_b, dev_driver1, dev_driver2),
업체, 요금표, 미션을 만들고, `npm run check:dev`로 권한 규칙이 실제 서버에서 동작하는지 확인해요.

**직접 하는 방법 (SQL 편집기)**: `supabase/migrations` 폴더의 파일을 **번호 순서대로** 넣어요.

1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. `20261116000001_schema.sql` 내용을 전부 복사해서 붙여 넣고 **Run**
3. 성공하면 다음 파일(`...0002`, `...0003`, ... 마지막 파일까지)도 같은 방법으로 하나씩 실행해요.
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

## 5. 관제 웹 켜기

1. `apps/admin/.env.local` 파일을 만들고 아래 이름으로 값을 넣어요. (이 파일은 GitHub에 올라가지 않아요)

| 이름 | 값 |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | 4번의 Project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | 4번의 anon public key |
| SUPABASE_SERVICE_ROLE_KEY | 4번의 service_role key (계정 만들기에만 씀) |
| NEXT_PUBLIC_KAKAO_JS_KEY | 카카오 개발자 사이트 → 앱 → 플랫폼 키 → JavaScript 키 (지도) |
| KAKAO_REST_KEY | 같은 곳의 REST API 키 (주소 → 좌표, 거리 계산) |
| DEV_PASSWORD | 개발용 계정 비밀번호 (`seed:dev`, `check:dev`, `dev:message`가 씀) |

2. 카카오 개발자 사이트에서 두 가지를 켜요.
   - **카카오맵** 사용 설정 (주소 검색·거리 계산에 필요)
   - JavaScript 키의 **JavaScript SDK 도메인**에 `http://localhost:3000` (실제 주소로 올릴 땐 그 주소도) 추가 — 안 하면 지도가 안 떠요
3. 저장소 루트에서 실행해요.

```bash
npm run dev -w @takson/admin
```

4. 브라우저에서 http://localhost:3000 을 열고 관리자 계정으로 로그인해요.
5. 문의 화면 확인용으로 테스트 고객 메시지를 하나 보낼 수 있어요: `npm run dev:message -- "보낼 말"`

## 6. 기사 앱 켜기

### 6-1. 연결 정보

`apps/driver/.env.example`을 같은 폴더에 `.env`로 복사하고, 4번의 Project URL과 anon public key를 넣어요. (이 파일은 GitHub에 올라가지 않아요)

### 6-2. 화면만 빨리 보기 (브라우저)

```bash
npm run web -w @takson/driver
```

카메라·화면 꺼짐 위치·푸시는 브라우저에서 안 돼요. 화면 모양과 오더 흐름만 볼 때 써요.

### 6-3. 휴대폰에서 개발하며 보기 (개발용 앱)

푸시와 화면 꺼짐 위치는 **Expo Go로는 안 되고**, 우리 전용 개발용 앱(개발 빌드)이 있어야 해요. 한 번 설치하면 코드를 고칠 때마다 다시 설치하지 않아도 돼요.

1. PC와 휴대폰을 **같은 와이파이**에 연결해요.
2. `apps/driver` 폴더에서 실행해요.

```bash
npx.cmd expo start --dev-client --port 8082
```

3. 휴대폰의 탁송 개발용 앱을 열고, 서버 고르는 화면이 나오면 PC 주소(예: `192.168.x.x:8082`)를 눌러요.
4. 고친 코드가 휴대폰에 안 들어오면 **휴대폰을 흔들어 Reload**를 눌러요.

### 6-4. 설치 파일(APK) 새로 만들기

처음 한 번만 준비해요. (이미 해 둠: Expo 계정, Firebase 프로젝트 `takson`, 푸시 키 업로드)

- `google-services.json`(Firebase → 안드로이드 앱 `com.takson.driver`)은 GitHub에 올리지 않고, EAS 파일 환경변수 `GOOGLE_SERVICES_JSON`으로 넣어 둬요.
- 푸시용 FCM V1 서비스 계정 키는 expo.dev → 프로젝트 → Credentials에 직접 올려요. **키 파일을 채팅이나 GitHub에 올리지 마세요.**
- 저장소 루트의 `.easignore`가 다른 폴더와 비밀 파일이 빌드 서버로 올라가지 않게 막아요.

`apps/driver` 폴더에서:

```bash
npx.cmd eas-cli build -p android --profile development
```

- `development`: 6-3에서 쓰는 개발용 앱
- `preview`: PC 없이 혼자 도는 시험용 앱. 만들기 전에 EAS의 preview 환경변수에 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`를 넣어야 해요.

빌드가 끝나면 나오는 링크(또는 QR)를 기사님 휴대폰으로 열어 설치해요. 처음 설치할 때 '출처를 알 수 없는 앱 설치'를 허용해야 해요.

### 6-5. 휴대폰 권한

- 위치: 배차된 오더가 있을 때 앱이 '항상 허용'을 부탁해요. 허용하면 화면이 꺼져도 1분마다 위치를 보내고, 알림창에 "탁송 운행 중" 알림이 떠요. 오더가 끝나면 사라져요.
- 알림: 처음 로그인할 때 허용해요. 로그아웃하면 이 휴대폰으로 알림이 더 오지 않아요.

## 7. 고객 앱 켜기

고객(업체) 계정으로 오더를 접수하고, 진행 상황·기사 위치·사진을 보고, 관제와 대화하는 앱이에요. 위치는 `apps/customer`, 안드로이드 패키지는 `com.takson.customer`예요.

### 7-1. 연결 정보

`apps/customer/.env.example`을 같은 폴더에 `.env`로 복사하고, 4번의 Project URL과 anon public key를 넣어요. (이 파일은 GitHub에 올라가지 않아요)

### 7-2. 카카오 주소·거리 (서버 함수)

주소 → 좌표, 거리 계산은 카카오 REST 키가 필요해서, 키를 앱에 넣지 않고 Supabase 함수 `kakao`가 대신 불러요.

- 키는 Supabase 비밀값 `KAKAO_REST_KEY`로 넣어요. **키 값을 채팅이나 GitHub에 올리지 마세요.**
- 함수를 고쳤을 때 다시 올리기 (저장소 루트에서):

```bash
npx.cmd supabase functions deploy kakao --use-api
```

### 7-3. 화면만 빨리 보기 (브라우저)

```bash
npm run web -w @takson/customer
```

http://localhost:8083 에서 열려요. 브라우저에서는 주소 검색 창 대신 주소를 직접 적는 칸이 나오고, 알림은 오지 않아요.

### 7-4. 휴대폰에서 개발하며 보기 (개발용 앱)

기사 앱(6-3)과 같아요. 설치한 '탁송 고객' 개발용 앱을 열고, `apps/customer` 폴더에서 실행해요. (기사 앱과 동시에 켤 수 있게 포트를 다르게 써요)

```bash
npx.cmd expo start --dev-client --port 8084
```

### 7-5. 설치 파일(APK) 새로 만들기

처음 한 번 준비는 끝나 있어요: Expo 프로젝트 `takson-customer`, 파일 환경변수 `GOOGLE_SERVICES_JSON`(development·preview), 푸시용 FCM V1 키.
같은 Firebase 프로젝트 `takson`의 `google-services.json`에 기사·고객 두 앱이 다 들어 있어요. 이 파일과 서비스 계정 키는 GitHub에 올리지 않아요.

`apps/customer` 폴더에서:

```bash
npx.cmd eas-cli build -p android --profile development
```

`preview`(PC 없이 혼자 도는 시험용)를 만들 때는 6-4처럼 EAS preview 환경변수에 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`를 먼저 넣어야 해요.

### 7-6. 고객에게 오는 알림

- 배차됐어요 · 기사 이름 / 기사가 바뀌었어요 · 새 기사 / 출발했어요 / 도착 완료 / 관제가 오더를 취소했어요 / 오더가 취소됐어요 · 취소한 동료 → 누르면 그 오더 화면
- 관제 메시지 → 누르면 대화 화면 (메시지 내용은 잠금화면에 보이지 않게 넣지 않아요)
- 같은 업체 고객 계정 모두에게 가요. 본인이 한 일(예: 직접 취소)은 본인에게 보내지 않아요.

## 개발자용 메모

- 테스트: 저장소 루트에서 `npm test`. Docker 없이 PGlite로 실제 마이그레이션을 돌려 검사해요.
- `supabase/tests/helpers/stubs.sql`은 테스트 전용 흉내 파일이에요. 실제 서버에는 넣지 않아요.
- 규칙 위반은 영문 코드(예: `ALREADY_TAKEN`)로 오류가 나요. 앱은 `@takson/shared`의 `errorMessage()`로 한국어 문구를 보여줘요.
