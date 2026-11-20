/** 관제 웹 충전금 화면 공통 표시 */
export const won = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('ko-KR')}원`;
export const kst = (iso: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(iso));
