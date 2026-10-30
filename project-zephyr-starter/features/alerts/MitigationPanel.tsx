import { Ban, CheckCircle2, Info } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Panel";
import { Term } from "@/components/ui/Tooltip";
import { explainIptablesCommand } from "@/lib/explain";
import { actionLabel, impactLabel, threatLabel } from "@/lib/format";
import { currentAttempt } from "@/lib/selectors";
import type { ActionPayload, AlertCase } from "@/types";
import { CriticChecklist } from "./CriticChecklist";
import { ExecutionBadge, ReviewBadge } from "./badges";
import { CircuitBreakerBanner } from "./CircuitBreakerBanner";

function ActionBlock({ a, tone }: { a: ActionPayload; tone: "chosen" | "rejected" }) {
  const explanation = explainIptablesCommand(a.iptables_cmd, a.target_container);
  return (
    <div className={tone === "rejected" ? "rounded-md border border-dashed border-border-strong p-3" : "rounded-md border border-border bg-elevated p-3"}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-strong">{actionLabel(a.action_type)}</span>
        <Badge tone={a.estimated_collateral_impact === "ZERO" || a.estimated_collateral_impact === "LOW" ? "success" : "danger"}>
          {impactLabel(a.estimated_collateral_impact)}
        </Badge>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        <Field label="Target">{a.target_container}</Field>
        <Field label="Source IP" mono>{a.source_ip}</Field>
        <Field label="Port" mono>{a.dest_port}</Field>
      </dl>
      <code className="mt-2 block break-all rounded bg-terminal-bg px-2 py-1.5 font-mono text-[11px] text-terminal-fg">{a.iptables_cmd}</code>
      {a.iptables_cmd && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent" />
          <span><strong className="text-fg">What this rule does:</strong> {explanation}</span>
        </p>
      )}
    </div>
  );
}

export function MitigationPanel({ c }: { c: AlertCase }) {
  const attempt = currentAttempt(c);
  if (!attempt) {
    return <p className="rounded-md border border-dashed border-border-strong p-3 text-xs text-muted">No mitigation proposal yet. The model is still working on this alert.</p>;
  }
  const env = attempt.envelope;
  const failed = !attempt.passed;
  const cbTriggered = c.backendMeta?.circuitBreaker.triggered === true;
  const qScore = c.backendMeta?.qScore;
  const isExecuted = c.stage === "executed" || c.execution.status === "confirmed";
  const mitigationSummary = c.backendMeta?.mitigationSummary ?? explainIptablesCommand(env.chosen_mitigation.iptables_cmd, env.chosen_mitigation.target_container);
  return (
    <div className="space-y-4">
      {isExecuted && (
        <div className="rounded-md border-2 border-emerald-500 bg-emerald-950/35 p-3.5">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold uppercase tracking-wide text-emerald-400">
                  Mitigation Executed &amp; Active in Container {env.chosen_mitigation.target_container}
                </p>
                {c.execution.finishedAt && <Badge tone="success">Applied {c.execution.finishedAt.slice(11, 19)} UTC</Badge>}
              </div>
              <p className="text-xs leading-relaxed text-fg">
                <strong>What was done:</strong> {mitigationSummary}
              </p>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400">Injected Kernel Netfilter Command:</span>
                <code className="mt-1 block break-all rounded bg-terminal-bg px-2.5 py-1.5 font-mono text-xs text-emerald-400">
                  {c.execution.appliedCommand ?? `docker exec ${env.chosen_mitigation.target_container} ${env.chosen_mitigation.iptables_cmd}`}
                </code>
              </div>
            </div>
          </div>
        </div>
      )}
      <CircuitBreakerBanner c={c} />
      {!cbTriggered && c.provenance === "backend" && !isExecuted && (
        <div className="rounded-md border-2 border-emerald-500/70 bg-emerald-950/25 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-emerald-400">
              Safety Gates Passed · Verified Mitigation
            </span>
            {qScore !== undefined && (
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300">
                Q-Score: {qScore.toFixed(2)}
              </span>
            )}
          </div>
          <code className="mt-2 block break-all rounded bg-terminal-bg px-2.5 py-2 font-mono text-xs text-emerald-400">
            {env.chosen_mitigation.iptables_cmd}
          </code>
          <p className="mt-2 text-xs leading-relaxed text-emerald-200/90">
            <strong>Mitigation explanation:</strong> {mitigationSummary}
          </p>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Threat class">{threatLabel(env.threat_classification)}</Field>
        <Field label="Human review"><ReviewBadge status={c.review.status} /></Field>
        <Field label="Execution"><ExecutionBadge status={c.execution.status} /></Field>
        <Field label="Q-Score">
          {qScore !== undefined ? (
            <span className="font-mono font-bold text-fg-strong">{qScore.toFixed(2)}</span>
          ) : (
            <>
              Attempt {attempt.index}
              {c.attempts.length > 1 && <span className="text-muted"> of {c.attempts.length}</span>}
            </>
          )}
        </Field>
      </dl>

      {failed ? (
        <div role="alert" className="flex gap-2.5 rounded-md border border-danger bg-danger-soft p-3">
          <Ban aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="text-xs text-fg">
            <p className="font-semibold text-danger">Blocked by the <Term k="critic">Critic</Term>: not executable</p>
            <p className="mt-0.5 text-muted">This proposal failed deterministic validation, so it cannot be approved or executed. Its details are shown for audit only.</p>
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">{failed ? "Proposed (rejected, not executable)" : "Proposed mitigation"}</h3>
        <ActionBlock a={env.chosen_mitigation} tone={failed ? "rejected" : "chosen"} />
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Reasoning</h3>
        <p className="text-[13px] text-fg">{env.reasoning_trace}</p>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Rejected alternative</h3>
        <ActionBlock a={env.rejected_alternative} tone="rejected" />
        <p className="mt-1.5 text-xs text-muted">Why rejected: {env.rejection_reason}</p>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Critic validation</h3>
        <CriticChecklist checks={attempt.checks} />
      </div>
    </div>
  );
}
