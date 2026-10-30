import { OctagonAlert, ShieldCheck } from "lucide-react";
import { explainIptablesCommand } from "@/lib/explain";
import type { AlertCase } from "@/types";

/**
 * High-visibility banner shown when the backend's safety gates intercepted an
 * unsafe model proposal and substituted the Golden Fallback rule.
 */
export function CircuitBreakerBanner({ c }: { c: AlertCase }) {
  const cb = c.backendMeta?.circuitBreaker;
  if (!cb?.triggered) return null;
  const applied = c.attempts[c.attempts.length - 1]?.envelope.chosen_mitigation.iptables_cmd;
  const targetNode = c.alert.target_node;
  return (
    <div role="alert" className="rounded-md border-2 border-danger bg-danger-soft p-3.5">
      <div className="flex items-start gap-2.5">
        <OctagonAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <p className="text-sm font-bold uppercase tracking-wide text-danger">{cb.banner ?? "Circuit breaker triggered: fallback rule engaged"}</p>
          {cb.reason && <p className="text-xs text-fg">{cb.reason}</p>}

          {cb.violatedGates.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-danger">Violated safety gates</h4>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-fg">
                {cb.violatedGates.map((g) => <li key={g}>{g}</li>)}
              </ul>
            </div>
          )}

          {cb.interceptedCmd && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-danger">Intercepted (blocked, never executed)</h4>
              <code className="mt-1 block break-all rounded bg-terminal-bg px-2 py-1.5 font-mono text-[11px] text-term-red line-through decoration-2">{cb.interceptedCmd}</code>
              <p className="mt-1 text-xs text-danger">
                <strong>Why blocked:</strong> {explainIptablesCommand(cb.interceptedCmd, targetNode)}
              </p>
            </div>
          )}

          {applied && (
            <div>
              <h4 className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-success">
                <ShieldCheck aria-hidden className="size-3.5" /> Golden Fallback rule substituted by the safety gate
              </h4>
              <code className="mt-1 block break-all rounded bg-terminal-bg px-2 py-1.5 font-mono text-[11px] text-term-green">{applied}</code>
              <p className="mt-1 text-xs text-fg">
                <strong>How the Golden Playbook rule works:</strong> {explainIptablesCommand(applied, targetNode)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
