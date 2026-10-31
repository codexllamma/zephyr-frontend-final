"use client";

import { useEffect, useState } from "react";
import { useDemo } from "@/components/providers/DemoProvider";
import { requestHealthCheck } from "@/features/simulation/SlaHeartbeat";
import { markResolved, requestSync } from "@/hooks/useBackendSync";
import { liveApi } from "@/lib/services/live";
import { currentAttempt } from "@/lib/selectors";

const POST_TERMINAL_LOG_DELAY_MS = 900;

export function AlertModal() {
  const { state, dispatch } = useDemo();
  const [readyAlertId, setReadyAlertId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);

  const pendingAlert = state.cases.find((c) => c.stage === "awaiting_review") ?? null;
  const pendingId = pendingAlert?.id ?? null;

  // Trigger timing: wait until after the terminal logs have executed and displayed before showing the HITL overlay.
  useEffect(() => {
    if (!pendingId) {
      setReadyAlertId(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setReadyAlertId(pendingId);
    }, POST_TERMINAL_LOG_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pendingId]);

  if (!pendingAlert || readyAlertId !== pendingAlert.id) return null;

  const attempt = currentAttempt(pendingAlert);
  const a = pendingAlert.alert;
  const exactRule =
    attempt?.envelope.chosen_mitigation.iptables_cmd ||
    `iptables -A INPUT -s ${a.source_ip} -p ${(a.protocol ?? "tcp").toLowerCase()} --dport ${a.dest_port} -j DROP`;

  const cbReason = pendingAlert.backendMeta?.circuitBreaker?.triggered
    ? pendingAlert.backendMeta.circuitBreaker.reason
    : undefined;

  const violationReason =
    cbReason ||
    `${a.nids_llm_assessment.attack_signature} (${a.source_ip} -> ${a.target_ip}:${a.dest_port})`;

  const handleDecision = async (approved: boolean) => {
    if (busy) return;
    setBusy(approved ? "accept" : "reject");
    try {
      if (pendingAlert.provenance === "backend") {
        const res = await liveApi.execute(pendingAlert.id, approved);
        markResolved(pendingAlert.id);
        dispatch({
          type: "live_resolved",
          alertId: pendingAlert.id,
          approved,
          status: res.status,
          cmd: res.injected_cmd,
          postmortem: res.postmortem_card,
          nowMs: Date.now(),
        });
        requestSync();
        if (approved) {
          requestHealthCheck(a.target_node);
        }
      } else {
        dispatch({
          type: "review",
          caseId: pendingAlert.id,
          decision: approved ? "approve" : "reject",
        });
      }
      setReadyAlertId(null);
    } catch {
      // Keep modal open on transient error so user can retry
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="HITL Alert Decision"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
    >
      <div className="flex min-h-[320px] w-full max-w-2xl flex-col justify-between rounded-md border border-zinc-800 bg-zinc-950 p-6 font-mono text-zinc-100">
        <div className="space-y-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-zinc-500">Violation Reason</p>
            <p className="mt-1.5 text-base font-semibold text-red-400">{violationReason}</p>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-widest text-zinc-500">Exact Rule</p>
            <code className="mt-1.5 block break-all rounded border border-zinc-800 bg-zinc-900 px-4 py-3 font-mono text-sm text-zinc-100">
              {exactRule}
            </code>
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-4 pt-8">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void handleDecision(true)}
            className="w-full rounded-md bg-green-600 py-4 text-center font-sans text-lg font-bold text-white transition-colors hover:bg-green-500 disabled:opacity-50"
          >
            {busy === "accept" ? "Accepting..." : "Accept"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void handleDecision(false)}
            className="w-full rounded-md bg-red-600 py-4 text-center font-sans text-lg font-bold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {busy === "reject" ? "Rejecting..." : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
