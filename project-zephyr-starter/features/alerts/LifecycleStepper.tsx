import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { STAGE_LABEL } from "@/lib/format";
import type { LifecycleStage } from "@/types";

const FLOW: LifecycleStage[] = ["detected", "awaiting_review", "validating", "approved", "executing", "executed"];
const TERMINAL: Partial<Record<LifecycleStage, number>> = { rejected: 2, revision_requested: 2, marked_benign: 2, failed: 5 };

export function LifecycleStepper({ stage }: { stage: LifecycleStage }) {
  const off = TERMINAL[stage];
  const idx = off !== undefined ? off : FLOW.indexOf(stage);
  const branch = off !== undefined;
  return (
    <ol aria-label="Alert lifecycle" className="flex flex-wrap items-center gap-y-2 text-xs">
      {FLOW.map((s, i) => {
        const done = i < idx || (!branch && i === idx && stage === "executed");
        const current = i === idx && !branch;
        return (
          <li key={s} className="flex items-center" aria-current={current ? "step" : undefined}>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium",
                done && "border-transparent bg-success-soft text-success",
                current && !done && "border-transparent bg-accent-soft text-accent",
                !done && !current && "border-border text-subtle",
              )}
            >
              {done && <Check aria-hidden className="size-3" />}
              {STAGE_LABEL[s]}
            </span>
            {i < FLOW.length - 1 && <span aria-hidden className="mx-1 h-px w-3 bg-border-strong" />}
          </li>
        );
      })}
      {branch && (
        <li className="ml-2 flex items-center" aria-current="step">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium",
              stage === "marked_benign" ? "bg-success-soft text-success" : stage === "revision_requested" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger",
            )}
          >
            {stage !== "marked_benign" && <X aria-hidden className="size-3" />}
            Ended: {STAGE_LABEL[stage]}
          </span>
        </li>
      )}
    </ol>
  );
}
