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
- 관제용: **웹** (Next.js, TypeScript), PC 화면 기준.
- 세 앱이 코드·타입을 공유하도록 한 저장소에서 관리.
- 서버/실시간/로그인/사진: Supabase 무료 요금제 우선. 사진은 압축해서 무료 용량 안에서 운영.
- 지도: 카카오맵 API. 알림: Expo 푸시.
- 결제: 현금·후불만. 앱 내 카드 결제(토스페이먼츠)는 1단계 제외.
- 단계: 1단계 오더 흐름 → 2단계 정산.
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

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `pny-ayann/A` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
