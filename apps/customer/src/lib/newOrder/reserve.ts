/** 예약 입력(한국 시간 'YYYY-MM-DD', 'HH:MM') → 서버에 넣을 ISO 시각. 잘못된 값이면 null */
export function kstInputToIso(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!d || !t) return null;
  const [y, m, day, hh, mm] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])];
  if (m < 1 || m > 12 || hh > 23 || mm > 59) return null;
  const utc = Date.UTC(y, m - 1, day, hh - 9, mm);
  // 2/30 같은 없는 날짜는 다음 달로 넘어가므로 다시 확인
  const back = new Date(utc + 9 * 3600 * 1000);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== day) return null;
  return new Date(utc).toISOString();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 예약 입력 기본값: 지금부터 1시간 이상 남은 첫 정각 (한국 시간 'YYYY-MM-DD', 'HH:00') */
export function defaultReserve(now: Date): { date: string; time: string } {
  const hour = 3600_000;
  const t = new Date(Math.ceil((now.getTime() + hour) / hour) * hour + 9 * hour); // 한국 시간으로 옮긴 값
  return {
    date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`,
    time: `${pad(t.getUTCHours())}:00`,
  };
}
