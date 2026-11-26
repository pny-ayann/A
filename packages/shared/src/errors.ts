const messages: Record<string, string> = {
  ALREADY_TAKEN: '이미 다른 기사가 잡은 오더예요.',
  NOT_OPEN: '지금은 잡을 수 없는 오더예요.',
  DRIVER_NOT_ACTIVE: '승인된 기사만 오더를 잡을 수 있어요.',
  HAS_ACTIVE_ORDER: '진행 중인 일반 오더를 먼저 끝내 주세요.',
  RESERVATION_CONFLICT: '다른 예약과 시간이 너무 가까워요.',
  RELEASE_WINDOW_PASSED: '반납 가능 시간이 지났어요. 관제에 문의해 주세요.',
  PHOTOS_REQUIRED: '필수 사진을 모두 올려 주세요.',
  CAPITAL_REQUIRED: '캐피탈 회사를 골라 주세요.',
  SEAL_COUNT_REQUIRED: '인감 수량을 적어 주세요.',
  DOCS_REQUIRED: '빠졌거나 다시 찍어야 할 서류가 있어요.',
  DOCS_NOT_APPROVED: '관제가 서류를 확인하는 중이에요. 확인되면 출발할 수 있어요.',
  DOC_CHANGED: '그 사이 기사님이 서류를 다시 찍었어요. 새로고침해서 다시 확인해 주세요.',
  INVALID_TRANSITION: '지금 상태에서는 할 수 없는 작업이에요.',
  REASON_REQUIRED: '사유를 입력해 주세요.',
  INVALID_MISSION: '꺼진 미션이 있어요. 다시 골라 주세요.',
  BALANCE_NEGATIVE: '충전금이 부족해요(마이너스). 충전 후 다시 시도해 주세요.',
  OVER_WITHDRAWABLE: '출금 가능 금액보다 많아요.',
  NO_BANK_ACCOUNT: '받을 계좌를 먼저 등록해 주세요.',
  INVALID_AMOUNT: '금액을 1원 이상으로 넣어 주세요.',
  ALREADY_PROCESSED: '이미 처리된 신청이에요.',
  SETTLEMENT_OFF: '정산이 아직 켜지지 않았어요.',
  INVALID_AMENDMENT: '도착지 변경, 경유지 추가, 미션 추가일 때만 바꿀 수 있어요.',
  CANCEL_NOT_ALLOWED: '배차된 오더는 관제에 문의해서 취소해 주세요.',
  FORBIDDEN: '권한이 없어요.',
  AMOUNT_CHANGED: '그 사이 청구금액이 바뀌었어요. 새로고침해서 금액을 다시 확인한 뒤 체크해 주세요.',
  NOT_FOUND: '오더를 찾을 수 없어요.',
  INVALID_LOGIN_ID: '아이디는 영문 소문자, 숫자, _ 로 3~20자예요.',
};

const fallback = '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';

/** 서버 오류 코드(또는 코드가 들어 있는 오류 문장)를 한국어 문구로 바꾼다. */
export function errorMessage(codeOrMessage: string): string {
  const tokens = codeOrMessage.split(/[^A-Z_]+/);
  const code = tokens.find(t => t in messages);
  return code ? messages[code]! : fallback;
}
