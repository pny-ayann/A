# 탁송어플 — Claude 작업 규칙

## 프로젝트 개요
탁송(차량 운송) 서비스용 **휴대폰 앱 3개**를 만든다. 세 앱은 **실시간으로 연동**되어야 한다.

| 앱 | 사용자 | 핵심 역할 |
|---|---|---|
| 기사용 | 탁송 기사 | 배차 받기, 위치 공유, 운행 상태 변경 |
| 고객용 | 고객 | 탁송 요청, 기사 위치·진행 상황 보기, 결제 |
| 관제용 | 운영자 | 전체 배차·기사 위치 실시간 관리 |

공통 기능: 회원가입/로그인, 지도/위치, 결제, 알림/메시지.

## 기술 방향 (2026-11-16 확정 — 바꿀 땐 사용자에게 먼저 설명)
- 설계 문서: `docs/superpowers/specs/2026-11-16-1단계-오더흐름-design.md`
- 기사용·고객용: React Native + Expo (TypeScript) 휴대폰 앱. **안드로이드 먼저**, 아이폰은 같은 코드로 나중에.
- 기사용 앱: 위치 `apps/driver`, 화면 확인 `npm run web -w @takson/driver` (브라우저). 휴대폰은 개발용 앱(EAS development 빌드) + `apps/driver`에서 `npx.cmd expo start --dev-client --port 8082` (푸시·화면 꺼짐 위치는 Expo Go로 안 됨). 자세한 건 `supabase/README.md` 6번. EAS 업로드 제외 목록은 루트 `.easignore`.
- 고객용 앱: 위치 `apps/customer`, 화면 확인 `npm run web -w @takson/customer` → http://localhost:8083. 휴대폰은 개발용 앱 + `apps/customer`에서 `npx.cmd expo start --dev-client --port 8084`. 카카오 주소·거리는 Supabase 함수 `kakao`(비밀값 `KAKAO_REST_KEY`)가 대신 부름. 자세한 건 `supabase/README.md` 7번.
- 관제용: **웹** (Next.js, TypeScript), PC 화면 기준. 위치 `apps/admin`, 실행 `npm run dev -w @takson/admin` → http://localhost:3000 (설정은 `supabase/README.md` 5번).
- 세 앱이 코드·타입을 공유하도록 한 저장소에서 관리.
- 서버/실시간/로그인/사진: Supabase 무료 요금제 우선. 사진은 압축해서 무료 용량 안에서 운영.
- 지도: 카카오맵 API. 알림: Expo 푸시.
- 결제: 현금·후불만. 앱 내 카드 결제(토스페이먼츠)는 1단계 제외.
- 단계: 1단계 오더 흐름 → 2단계 정산.
- 2단계-1 기사 정산: 충전금은 `wallet_entries` 장부(잔액 칸 없음, 합으로만), 완료 오더 정산은 서버 트리거 `settle_order`가 차이만 적음. 운영 방법은 `supabase/README.md` 8번. 가상계좌·자동 송금은 아직 없음(출금 신청에 자리만 있음).
- 2단계-2 업체 정산: 관제웹 `/admin/billing`(관리자·정산 등급. 직원 등급: admin·operator·accounting, 정산 권한 검사는 DB 함수 `can_settle`). 정산서 금액은 저장 없이 DB 함수 `billing_lines_all` 하나에서 계산(`billing_lines`·`billing_totals`·`billing_summary`·`billing_receivables`), 저장은 입금 체크 `company_payments`(체크 때 금액)뿐. 엑셀은 `exceljs`, `/api/billing/excel`. 세금계산서는 홈택스에서 직접. 운영은 `supabase/README.md` 9번.
- 서류탁송(1단계): 오더 종류 `takson`·`docs`·`daeri`. 서류 사진은 `order_documents`(관제 `review_document`로 인정·불인정, 모두 인정돼야 운행 시작), 캐피탈 회사·예시는 `capital_companies`·`capital_examples`·비공개 버킷 `capital-examples`. `예시서류/` 원본은 GitHub 제외. 운영은 `supabase/README.md` 10번. 휴대폰 AI 검사(2단계)는 아직.
- GitHub 저장소: https://github.com/pny-ayann/A (브랜치 main)

## 사용자와 일하는 방식
- 사용자는 **완전 초보**다. 항상 **쉬운 한국어**로, 단계별로 설명한다. 전문 용어는 한 줄 풀이를 붙인다.
- 명령 실행 결과·로그 원문은 **사용자가 달라고 할 때만** 보여준다. 평소엔 "무엇이 됐는지"만 말로 요약한다.
- **무료 우선.** 유료가 꼭 필요하면 왜 필요한지, 무료 대체제가 있는지 간단히 설명하고 허락을 받는다.
- 확인 질문은 꼭 필요할 때만. 상식적인 기본값으로 진행하고, 무엇을 골랐는지 알려준다.
- 실수를 줄이기 위해 만든 것은 스스로 실행·검사(타입 검사, 테스트)한 뒤 보고한다. 확인 못 한 것은 솔직히 말한다.

## 스킬 사용 순서
- superpowers와 Matt Pocock skills가 겹치면 **superpowers를 먼저** 쓴다.
  - 테스트 먼저: `superpowers:test-driven-development` (mattpocock `tdd` 대신)
  - 버그 찾기: `superpowers:systematic-debugging` (mattpocock `diagnosing-bugs` 대신)
  - 코드 검사: `superpowers:requesting-code-review` (mattpocock `code-review` 대신)
- 겹치지 않는 Matt Pocock 스킬(`grill-me`, `handoff`, `wait-what`, `prototype` 등)은 그대로 쓴다.
- 작은 일(설정 변경, 한두 줄 수정)은 brainstorming·계획 단계를 건너뛴다. 질문은 꼭 필요할 때만.

## 답하는 형식
- 사용자가 고르거나 답해야 할 때는 **버튼(선택지)** 으로 묻는다. 사용자가 같은 말을 다시 타이핑하지 않게 한다.
- 사용자가 입력해야 할 명령이나 문장은 **코드 블록**에 넣어 복사 버튼으로 바로 복사할 수 있게 한다.

## 금지/주의
- 비밀 키·비밀번호(.env)는 절대 GitHub에 올리지 않는다.
- 커밋·푸시는 사용자가 요청할 때만 한다.
- 훅 `.claude/hooks/guard.mjs`: 커밋·푸시 전 비밀값 검사, 이미 적용한 마이그레이션 수정 금지. 서버에 `db push`한 뒤에는 `supabase/.applied-migration` 번호를 올린다. 훅이 막으면 우회하지 말고 사용자에게 알린다.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `pny-ayann/A` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
