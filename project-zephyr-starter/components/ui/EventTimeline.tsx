import { cn } from "@/lib/cn";
import { fmtTime } from "@/lib/format";
import type { EventSeverity, ZephyrEvent } from "@/types";

const DOT: Record<EventSeverity, string> = {
  info: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  critical: "bg-danger",
};

const ACTOR: Record<ZephyrEvent["actor"], string> = {
  system: "System",
  nids: "NIDS",
  model: "Model",
  critic: "Critic",
  reviewer: "Reviewer",
  executor: "Executor",
};

export function EventTimeline({ events, newestFirst = false }: { events: ZephyrEvent[]; newestFirst?: boolean }) {
  const list = newestFirst ? [...events].reverse() : events;
  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {list.map((e) => (
        <li key={e.id} className="relative">
          <span aria-hidden className={cn("absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface", DOT[e.severity])} />
          <div className="flex items-baseline gap-2 text-[11px] text-subtle">
            <time dateTime={e.ts} className="font-mono">{fmtTime(e.ts)}</time>
            <span className="uppercase tracking-wide">{ACTOR[e.actor]}</span>
          </div>
          <p className="text-[13px] text-fg">{e.message}</p>
        </li>
      ))}
    </ol>
  );
}
