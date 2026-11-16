import type { ActionResult } from '@/lib/admin/guard';

/** 서버 액션 결과 한 줄 안내 */
export function Notice({ result }: { result: ActionResult }) {
  if (!result) return null;
  return (
    <p role={result.ok ? 'status' : 'alert'} className={`text-sm ${result.ok ? 'text-green-700' : 'text-red-600'}`}>
      {result.message}
    </p>
  );
}
