import { describeEvent, type EventLike } from '@/lib/orders/actions';

export type TimelineEvent = EventLike & { id: string; created_at: string; actor: string | null };

const kst = (iso: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(iso));

/** 오더 이력 (오래된 것부터) */
export function EventTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <section className="rounded border bg-white p-3">
      <h2 className="mb-2 font-semibold">이력</h2>
      {events.length === 0
        ? <p className="text-sm text-slate-500">아직 이력이 없어요.</p>
        : (
          <ol className="space-y-1 text-sm">
            {events.map(e => (
              <li key={e.id} className={`flex gap-3 ${e.type === 'photo_override' ? 'text-red-700' : ''}`}>
                <span className="w-28 shrink-0 text-slate-500">{kst(e.created_at)}</span>
                <span className="min-w-0 flex-1">{describeEvent(e)}</span>
                <span className="shrink-0 text-xs text-slate-400">{e.actor ?? ''}</span>
              </li>
            ))}
          </ol>
        )}
    </section>
  );
}
