"use client";

import { useState } from "react";
import { Check, CheckCircle2, Info, OctagonAlert, ShieldCheck, X } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { requestHealthCheck } from "@/features/simulation/SlaHeartbeat";
import { markResolved, requestSync } from "@/hooks/useBackendSync";
import { cn } from "@/lib/cn";
import { THREAT_DESCRIPTIONS, explainIptablesCommand } from "@/lib/explain";
import { fmtTime, shortId, threatLabel } from "@/lib/format";
import { liveApi } from "@/lib/services/live";
import { currentAttempt } from "@/lib/selectors";
import type { AlertCase } from "@/types";
import { SeverityBadge, StageBadge } from "./badges";

/**
 * Zone 2: Blue Team HITL Approval Card.
 * Reads `circuit_breaker_triggered`:
 * - If false: renders a clean green/emerald card displaying `chosen_mitigation.iptables_cmd` and `q_score`.
 * - If true: shifts the card to a high-alert warning state (amber/red), renders `circuit_breaker_reason`,
 *   strikes through `chosen_mitigation.intercepted_flawed_cmd`, and highlights the Golden Playbook rule that automatically took over.
 * Includes direct "Approve" button bound to POST `/api/v1/execute/{alert_id}` (`{"approved": true}`), triggering the SLA monitor on 200 OK.
 */
export function AlertSummaryRow({ c, selected, onSelect }: { c: AlertCase; selected?: boolean; onSelect: (id: string) => void }) {
  const { dispatch } = useDemo();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const a = c.alert;
  const attempt = currentAttempt(c);
  const rawThreat = attempt?.envelope.threat_classification ?? a.nids_llm_assessment.attack_signature;
  const threat = threatLabel(rawThreat);
  const chosenCmd = attempt?.envelope.chosen_mitigation.iptables_cmd ?? "";
  const cb = c.backendMeta?.circuitBreaker;
  const cbTriggered = cb?.triggered === true;
  const qScore = c.backendMeta?.qScore;
  const isLivePending = c.provenance === "backend" && c.stage === "awaiting_review";
  const isExecuted = c.stage === "executed" || c.execution.status === "confirmed";
  const threatDescription = c.backendMeta?.description ?? THREAT_DESCRIPTIONS[rawThreat] ?? c.summary;
  const mitigationSummary = c.backendMeta?.mitigationSummary ?? explainIptablesCommand(chosenCmd, a.target_node);

  const handleDecision = async (approved: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(approved ? "approve" : "reject");
    try {
      const res = await liveApi.execute(c.id, approved);
      markResolved(c.id);
      dispatch({
        type: "live_resolved",
        alertId: c.id,
        approved,
        status: res.status,
        cmd: res.injected_cmd,
        postmortem: res.postmortem_card,
        nowMs: Date.now(),
      });
      dispatch({
        type: "toast_push",
        tone: approved ? "success" : "info",
        title: approved ? "Mitigation executed" : "Mitigation rejected",
        message: approved
          ? `Alert ${shortId(c.id)}: ${res.injected_cmd ?? res.status}`
          : `Alert ${shortId(c.id)} rejected.`,
      });
      requestSync();
      if (approved) {
        requestHealthCheck(a.target_node);
      }
    } catch (err) {
      dispatch({
        type: "toast_push",
        tone: "danger",
        title: approved ? "Execution failed" : "Rejection failed",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      onClick={() => onSelect(c.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(c.id);
        }
      }}
      className={cn(
        "m-2 flex flex-col gap-2 rounded-lg border-2 p-3 text-left transition-colors cursor-pointer",
        cbTriggered
          ? "border-red-500/70 bg-red-950/25 hover:bg-red-950/35"
          : "border-emerald-500/60 bg-emerald-950/20 hover:bg-emerald-950/30",
        selected && "ring-2 ring-accent",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-fg-strong">{shortId(c.id)}</span>
          <SeverityBadge severity={a.nids_llm_assessment.severity} />
          {qScore !== undefined && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[11px] font-bold",
                cbTriggered ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300",
              )}
            >
              Q = {qScore.toFixed(2)}
            </span>
          )}
          {cbTriggered ? (
            <Badge tone="danger">CIRCUIT BREAKER INTERCEPTED</Badge>
          ) : (
            <Badge tone="success">VERIFIED · SAFE TO EXECUTE</Badge>
          )}
        </div>
        <StageBadge stage={c.stage} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[13px] text-fg-strong">{threat}</span>
          {c.backendScenarioId && (
            <span className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted">
              {c.backendScenarioId}
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-muted">
          {a.source_node} ({a.source_ip}) → {a.target_node}:{a.dest_port} · {fmtTime(a.timestamp)} UTC
        </span>
      </div>

      {/* Threat Description */}
      <p className="text-xs leading-relaxed text-muted">
        <strong className="text-fg">Threat mechanism:</strong> {threatDescription}
      </p>

      {cbTriggered ? (
        <div className="space-y-1.5 rounded-md border border-amber-500/40 bg-red-950/40 p-2.5 text-xs">
          <p className="flex items-center gap-1.5 font-semibold text-amber-300">
            <OctagonAlert aria-hidden className="size-4 shrink-0 text-red-400" />
            <span>{cb.reason ?? "Safety Gate Triggered"}</span>
          </p>
          {cb.interceptedCmd && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-red-400">Intercepted Flawed Proposal (Blocked):</span>
              <code className="mt-0.5 block break-all rounded bg-terminal-bg px-2 py-1 font-mono text-[11px] text-red-400 line-through decoration-2">
                {cb.interceptedCmd}
              </code>
              <p className="mt-0.5 text-[11px] text-red-300/90">
                Why blocked: {explainIptablesCommand(cb.interceptedCmd, a.target_node)}
              </p>
            </div>
          )}
          <div>
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
              <ShieldCheck aria-hidden className="size-3.5" /> Golden Playbook Rule Substituted Automatically:
            </span>
            <code className="mt-0.5 block break-all rounded border border-emerald-500/40 bg-terminal-bg px-2 py-1 font-mono text-[11px] text-emerald-400">
              {chosenCmd}
            </code>
            <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-emerald-200/90">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
              <span><strong>How this mitigation works:</strong> {mitigationSummary}</span>
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 rounded-md border border-emerald-500/40 bg-emerald-950/30 p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
              <ShieldCheck aria-hidden className="size-3.5" /> {isExecuted ? "Executed Mitigation (iptables_cmd)" : "Proposed Mitigation (iptables_cmd)"}
            </span>
            {qScore !== undefined && <span className="font-mono text-[11px] font-semibold text-emerald-400">Q-Score: {qScore.toFixed(2)}</span>}
          </div>
          <code className="block break-all rounded bg-terminal-bg px-2 py-1 font-mono text-[11px] text-emerald-400">
            {chosenCmd}
          </code>
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-emerald-200/90">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
            <span><strong>How this mitigation works:</strong> {mitigationSummary}</span>
          </p>
        </div>
      )}

      {isExecuted && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1.5 text-xs text-emerald-300">
          <CheckCircle2 aria-hidden className="size-4 shrink-0 text-emerald-400" />
          <span className="min-w-0 flex-1">
            <strong>Executed on {a.target_node}:</strong>{" "}
            <code className="font-mono text-[11px]">{c.execution.appliedCommand ?? `docker exec ${a.target_node} ${chosenCmd}`}</code>
          </span>
        </div>
      )}

      {isLivePending && (
        <div className="mt-1 flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={(e) => void handleDecision(true, e)}
            disabled={!!busy}
          >
            <Check aria-hidden className="size-3.5" />
            {busy === "approve" ? "Executing…" : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={(e) => void handleDecision(false, e)}
            disabled={!!busy}
          >
            <X aria-hidden className="size-3.5" />
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </Button>
        </div>
      )}
    </div>
  );
}
