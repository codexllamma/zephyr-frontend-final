import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Term } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import type { CriticCheck, CriticStatus } from "@/types";

const META: Record<CriticStatus, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  passed: { label: "Passed", icon: CheckCircle2, cls: "text-success" },
  failed: { label: "Failed", icon: XCircle, cls: "text-danger" },
  not_evaluated: { label: "Not evaluated", icon: CircleDashed, cls: "text-subtle" },
};

export function CriticChecklist({ checks, compact }: { checks: CriticCheck[]; compact?: boolean }) {
  return (
    <ul aria-label="Critic validation checklist" className="divide-y divide-border rounded-md border border-border">
      {checks.map((c) => {
        const m = META[c.status];
        return (
          <li key={c.id} className="flex gap-2.5 px-3 py-2">
            <m.icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", m.cls)} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-fg-strong">
                  {c.id === "grounding" ? (
                    <>
                      <Term k="entity_grounding">Entity</Term>/IP grounding
                    </>
                  ) : (
                    c.label
                  )}
                </span>
                <span className={cn("text-xs font-medium", m.cls)}>{m.label}</span>
              </div>
              {!compact && <p className="mt-0.5 text-xs text-muted">{c.detail}</p>}
              {c.status === "failed" && c.findings.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {c.findings.map((f) => (
                    <li key={f} className="rounded bg-danger-soft px-2 py-1 font-mono text-[11px] text-danger">
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
