"use client";

import { useState } from "react";
import { Check, FilePenLine, ShieldCheck, X } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Button } from "@/components/ui/Button";
import { requestHealthCheck } from "@/features/simulation/SlaHeartbeat";
import { markResolved, requestSync } from "@/hooks/useBackendSync";
import { liveApi } from "@/lib/services/live";
import { shortId } from "@/lib/format";
import { currentAttempt } from "@/lib/selectors";
import type { AlertCase } from "@/types";

const UNSUPPORTED = "The live backend has no endpoint for this action. Only Approve & Execute and Reject are supported.";

/**
 * Human review against the live backend: POST /api/v1/execute/{alert_id}.
 * The alert leaves the queue only after a 200 OK; any failure keeps it (and
 * the edited command) in place so the reviewer can retry.
 */
export function LiveReviewControls({ c }: { c: AlertCase }) {
  const { dispatch } = useDemo();
  const original = currentAttempt(c)?.envelope.chosen_mitigation.iptables_cmd ?? "";
  const isNoOp = currentAttempt(c)?.envelope.chosen_mitigation.action_type === "NO_OP";
  const [cmd, setCmd] = useState(original);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = cmd.trim();
  const edited = trimmed !== original.trim();
  const cmdProblem = isNoOp ? null : !trimmed ? "The firewall command cannot be empty." : !/^iptables\s/.test(trimmed) ? 'The command must start with "iptables ".' : null;

  const submit = async (approved: boolean) => {
    if (busy || (approved && cmdProblem)) return;
    setBusy(approved ? "approve" : "reject");
    setError(null);
    try {
      const res = await liveApi.execute(c.id, approved, approved && edited ? trimmed : undefined);
      markResolved(c.id);
      dispatch({ type: "live_resolved", alertId: c.id, approved, status: res.status, cmd: res.injected_cmd, postmortem: res.postmortem_card, nowMs: Date.now() });
      dispatch({
        type: "toast_push",
        tone: approved && res.simulated ? "warning" : "success",
        title: approved ? (res.simulated ? "Mitigation recorded (simulated by backend)" : "Mitigation executed") : "Mitigation rejected",
        message: approved
          ? `Alert ${shortId(c.id)}: ${res.injected_cmd ?? res.status}${res.postmortem_card?.postmortem_id ? ` · postmortem ${res.postmortem_card.postmortem_id}` : ""}`
          : `Alert ${shortId(c.id)} was rejected. Nothing was applied.`,
      });
      requestSync();
      if (approved) {
        requestHealthCheck(c.alert.target_node);
        window.setTimeout(() => requestHealthCheck(c.alert.target_node), 1500); // re-check once the rule has taken effect
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      dispatch({ type: "toast_push", tone: "danger", title: approved ? "Execution failed" : "Rejection failed", message: `${msg} The alert is still pending; you can retry.` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {!isNoOp && (
        <label className="block">
          <span className="flex items-center justify-between text-xs font-medium text-muted">
            Firewall command (editable)
            {edited && (
              <button type="button" onClick={() => setCmd(original)} className="text-accent hover:underline">
                Reset to model proposal
              </button>
            )}
          </span>
          <textarea
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            rows={3}
            spellCheck={false}
            aria-invalid={!!cmdProblem}
            aria-describedby={`cmd-hint-${c.id}`}
            className="mt-1 w-full resize-y rounded-md border border-border bg-terminal-bg px-2.5 py-2 font-mono text-[11px] text-terminal-fg aria-[invalid=true]:border-danger"
          />
          <span id={`cmd-hint-${c.id}`} className={cmdProblem ? "text-xs text-danger" : "text-xs text-muted"}>
            {cmdProblem ?? (edited ? "Edited: this command will be sent instead of the model's proposal." : (c.backendMeta?.circuitBreaker.triggered ? "Unchanged: this is the Golden Fallback rule substituted by the safety gate." : "Unchanged: the backend will use the model's proposed command."))}
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => submit(true)} disabled={!!busy || !!(cmdProblem && !isNoOp)}>
          <Check aria-hidden className="size-4" /> {busy === "approve" ? "Executing…" : "Approve & Execute"}
        </Button>
        <Button variant="danger" onClick={() => submit(false)} disabled={!!busy}>
          <X aria-hidden className="size-4" /> {busy === "reject" ? "Rejecting…" : "Reject"}
        </Button>
        <Button disabled title={UNSUPPORTED}>
          <FilePenLine aria-hidden className="size-4" /> Request Revision
        </Button>
        <Button disabled title={UNSUPPORTED}>
          <ShieldCheck aria-hidden className="size-4" /> Mark as Benign
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger-soft px-2.5 py-2 text-xs text-fg">
          <strong className="text-danger">Not applied: </strong>
          {error} The alert is still in the queue. Fix the command if needed and try again.
        </p>
      )}
    </div>
  );
}
