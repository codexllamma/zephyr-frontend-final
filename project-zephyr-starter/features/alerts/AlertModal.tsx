"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { requestHealthCheck } from "@/features/simulation/SlaHeartbeat";
import { markResolved, requestSync } from "@/hooks/useBackendSync";
import { cn } from "@/lib/cn";
import { liveApi } from "@/lib/services/live";
import { currentAttempt } from "@/lib/selectors";
import type { AlertCase } from "@/types";

const TOTAL_SEGMENTS = 20;

export function AlertModal() {
  const { state } = useDemo();
  const isThinking = state.drama.phase === "thinking";
  const pendingAlert = !isThinking
    ? ([...state.cases].reverse().find((c) => c.stage === "awaiting_review") ?? null)
    : null;

  if (!pendingAlert) return null;
  return <AlertToastCard key={pendingAlert.id} pendingAlert={pendingAlert} />;
}

function AlertToastCard({ pendingAlert }: { pendingAlert: AlertCase }) {
  const { dispatch } = useDemo();
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [displayPct, setDisplayPct] = useState(0);
  const [cbWarningVisible, setCbWarningVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const meta = pendingAlert.backendMeta;
  const isLive = meta?.executionMode === "live" || pendingAlert.provenance === "backend";
  const latencySec = meta?.latencySec ?? (isLive ? 5.2 : 14.0);
  const modelName = meta?.modelName || (isLive ? "zephyr-dpo-v3 (Kaggle GPU)" : "zephyr-dataset-playbook");

  const rawScore =
    meta?.compositeScore ??
    meta?.qScore ??
    pendingAlert.alert.nids_llm_assessment.confidence_score ??
    0.95;
  const threshold = meta?.executionThreshold ?? 80;
  const targetPct = Math.max(
    1,
    Math.min(100, Math.round(rawScore <= 1 ? rawScore * 100 : rawScore)),
  );
  const cbTriggered =
    meta?.circuitBreaker?.triggered === true ||
    (meta?.compositeScore !== undefined && meta.compositeScore < threshold);
  const isHighConfidence = targetPct >= threshold && !cbTriggered && !meta?.isZeroDay;

  useEffect(() => {
    const enterRaf = window.requestAnimationFrame(() => {
      setEntered(true);
    });

    const timers: number[] = [];

    if (isHighConfidence) {
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        timers.push(
          window.setTimeout(() => {
            setDisplayPct(Math.round((targetPct * i) / steps));
          }, 80 + i * 38),
        );
      }
    } else {
      const peak = Math.min(72, targetPct + 14);
      const dip = Math.max(12, targetPct - 11);
      const jitter = Math.min(73, targetPct + 5);
      const keyframes: [number, number][] = [
        [110, Math.round(targetPct * 0.45)],
        [240, peak],
        [390, dip],
        [540, jitter],
        [690, Math.max(10, targetPct - 4)],
        [830, targetPct],
      ];
      for (const [delay, val] of keyframes) {
        timers.push(window.setTimeout(() => setDisplayPct(val), delay));
      }
      timers.push(
        window.setTimeout(() => {
          setCbWarningVisible(true);
        }, 720),
      );
    }

    return () => {
      window.cancelAnimationFrame(enterRaf);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [targetPct, isHighConfidence]);

  const attempt = currentAttempt(pendingAlert);
  const a = pendingAlert.alert;
  const exactRule =
    attempt?.envelope.chosen_mitigation.iptables_cmd ||
    `iptables -A INPUT -s ${a.source_ip} -p ${(a.protocol ?? "tcp").toLowerCase()} --dport ${a.dest_port} -j DROP`;

  const interceptedCmd = pendingAlert.backendMeta?.circuitBreaker?.interceptedCmd;
  const reasoning =
    attempt?.envelope.reasoning_trace ||
    pendingAlert.summary ||
    `Anomalous ${a.nids_llm_assessment.attack_signature} traffic detected from ${a.source_ip} targeting ${a.target_node} (${a.target_ip}:${a.dest_port}). Surgical /32 netfilter drop isolates attacker while preserving benign SLA traffic.`;

  const filledSegments = Math.round((displayPct / 100) * TOTAL_SEGMENTS);
  const barToneClass = isHighConfidence
    ? "bg-emerald-600"
    : targetPct < 35
      ? "bg-red-600"
      : "bg-orange-600";
  const pctTextClass = isHighConfidence
    ? "text-emerald-400"
    : targetPct < 35
      ? "text-red-400"
      : "text-orange-400";

  const handleDecision = async (approved: boolean) => {
    if (busy || closing) return;
    setBusy(approved ? "accept" : "reject");
    setErrorMsg(null);
    setClosing(true);

    try {
      if (pendingAlert.provenance === "backend") {
        const res = await liveApi.execute(pendingAlert.id, approved);
        markResolved(pendingAlert.id);
        window.setTimeout(() => {
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
        }, 220);
      } else {
        window.setTimeout(() => {
          dispatch({
            type: "review",
            caseId: pendingAlert.id,
            decision: approved ? "approve" : "reject",
          });
        }, 220);
      }
    } catch (e) {
      setClosing(false);
      setErrorMsg(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="Mitigation Decision Toast"
      className={cn(
        "fixed bottom-6 right-6 z-50 w-[430px] max-w-[calc(100vw-2rem)] rounded-md border bg-zinc-950 p-4 text-zinc-100 shadow-2xl transition-all duration-300",
        meta?.isZeroDay ? "border-amber-600/90 shadow-[0_0_25px_rgba(217,119,6,0.25)]" : "border-zinc-800",
        entered && !closing
          ? "translate-y-0 opacity-100 ease-out"
          : "pointer-events-none translate-y-10 opacity-0 ease-in",
      )}
    >
      {/* Engine Execution Provenance Tag */}
      <div
        className={cn(
          "flex items-center justify-between rounded border px-2.5 py-1.5 font-mono text-[11px] leading-tight transition-colors",
          isLive
            ? "border-emerald-800/80 bg-emerald-950/50 text-emerald-300"
            : "border-amber-800/80 bg-amber-950/50 text-amber-300",
        )}
      >
        <div className="flex items-center gap-1.5 font-bold tracking-wide">
          <span
            className={cn(
              "inline-block size-2 rounded-full",
              isLive ? "animate-pulse bg-emerald-400" : "bg-amber-400",
            )}
          />
          <span>{isLive ? "LIVE KAGGLE INFERENCE" : "DEMO PLAYBOOK ENGINE"}</span>
        </div>
        <span
          className={cn(
            "tabular text-[10px] font-semibold",
            isLive ? "text-emerald-400" : "text-amber-400",
          )}
        >
          ⏱ {latencySec.toFixed(2)}s {isLive ? "GPU LATENCY" : "BENCHMARK HOLD"}
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-zinc-500">
        <span className="max-w-[240px] truncate">Model: {modelName}</span>
        <span className="truncate">
          {isLive ? "Tunnel: Cloudflare" : "Route: /api/mock/threat"}
        </span>
      </div>

      {meta?.isZeroDay && (
        <div className="mt-2 flex items-center gap-2 rounded border border-amber-600/80 bg-amber-950/70 px-2.5 py-1.5 font-mono text-[11px] font-bold tracking-wide text-amber-300">
          <ShieldAlert aria-hidden className="size-4 shrink-0 text-amber-400" />
          <span>FAIL-SAFE PROTOCOL: ZERO-DAY (OOD) DETECTED</span>
        </div>
      )}

      {(meta?.macroFamily || meta?.explainableTrigger) && (
        <div className="mt-2 flex items-center justify-between gap-1 rounded border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 font-mono text-[10px]">
          <span className="text-zinc-400">
            Macro: <strong className="text-zinc-200">{meta?.macroFamily ?? "General"}</strong>
          </span>
          {meta?.explainableTrigger && (
            <span className="truncate font-semibold text-amber-400">⚡ {meta.explainableTrigger}</span>
          )}
        </div>
      )}

      {/* Threat Header */}
      <div className="mt-3 flex items-center justify-between gap-2 border-b border-zinc-800/90 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldAlert
            aria-hidden
            className={cn(
              "size-4 shrink-0",
              isHighConfidence ? "text-red-400" : "text-orange-400",
            )}
          />
          <span className="truncate font-mono text-xs font-semibold text-zinc-100">
            {attempt?.envelope.threat_classification ?? a.nids_llm_assessment.attack_signature}
          </span>
        </div>
        <span className="shrink-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
          {a.source_node} → {a.target_node}
        </span>
      </div>

      {/* Segmented AI Confidence Score Bar */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between font-mono text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="uppercase tracking-wider text-zinc-400">AI Confidence Score</span>
            {meta?.ttlDisplay && (
              <span className="rounded border border-emerald-700/80 bg-emerald-950/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                TTL: {meta.ttlDisplay}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500">Threshold: {threshold}%</span>
            <span className={cn("tabular font-bold", pctTextClass)}>{displayPct}%</span>
          </div>
        </div>

        <div
          role="progressbar"
          aria-label="AI Confidence Score"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={displayPct}
          className="flex h-2.5 w-full gap-1 rounded-xs border border-zinc-800 bg-zinc-900 p-0.5"
        >
          {Array.from({ length: TOTAL_SEGMENTS }).map((_, idx) => {
            const active = idx < filledSegments;
            return (
              <span
                key={idx}
                className={cn(
                  "h-full flex-1 rounded-[1px] transition-colors duration-100",
                  active ? barToneClass : "bg-zinc-800/70",
                )}
              />
            );
          })}
        </div>

        {meta?.gateScores && (
          <div className="mt-1.5 grid grid-cols-3 gap-1 font-mono text-[9px]">
            <div
              className={cn(
                "rounded border px-1.5 py-0.5",
                (meta.gateScores.syntax_validity ?? 20) < 20
                  ? "border-red-800 bg-red-950/40 font-bold text-red-400"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400",
              )}
            >
              Syntax: {meta.gateScores.syntax_validity ?? 20}/20
            </div>
            <div
              className={cn(
                "rounded border px-1.5 py-0.5",
                (meta.gateScores.blast_radius_scope ?? 25) < 25
                  ? "border-red-800 bg-red-950/40 font-bold text-red-400"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400",
              )}
            >
              Blast: {meta.gateScores.blast_radius_scope ?? 25}/25
            </div>
            <div
              className={cn(
                "rounded border px-1.5 py-0.5",
                (meta.gateScores.target_coherence ?? 15) < 15
                  ? "border-red-800 bg-red-950/40 font-bold text-red-400"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400",
              )}
            >
              Target: {meta.gateScores.target_coherence ?? 15}/15
            </div>
            <div
              className={cn(
                "rounded border px-1.5 py-0.5",
                (meta.gateScores.protocol_port_alignment ?? 15) < 15
                  ? "border-red-800 bg-red-950/40 font-bold text-red-400"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400",
              )}
            >
              Proto: {meta.gateScores.protocol_port_alignment ?? 15}/15
            </div>
            <div
              className={cn(
                "rounded border px-1.5 py-0.5",
                (meta.gateScores.directionality ?? 10) < 10
                  ? "border-red-800 bg-red-950/40 font-bold text-red-400"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400",
              )}
            >
              Dir: {meta.gateScores.directionality ?? 10}/10
            </div>
            <div
              className={cn(
                "rounded border px-1.5 py-0.5",
                (meta.gateScores.action_severity ?? 15) < 15
                  ? "border-red-800 bg-red-950/40 font-bold text-red-400"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400",
              )}
            >
              Action: {meta.gateScores.action_severity ?? 15}/15
            </div>
          </div>
        )}

        {(!isHighConfidence || cbTriggered) && cbWarningVisible && (
          <div className="flex items-center gap-2 rounded border border-orange-800/80 bg-orange-950/50 px-2.5 py-1.5 font-mono text-[11px] font-bold tracking-wider text-orange-400">
            <AlertTriangle aria-hidden className="size-3.5 shrink-0 text-orange-400" />
            <span>CIRCUIT BREAKER ENGAGED · FALLBACK LOADED</span>
          </div>
        )}

        {(cbTriggered || meta?.violationDelta) && (
          <div className="mt-2 space-y-1 rounded border border-orange-800/80 bg-orange-950/40 p-2 font-mono text-[10px]">
            <div className="break-all font-semibold leading-tight text-red-400">
              <span className="mr-1 rounded border border-red-800 bg-red-950 px-1 py-0.5 text-[9px] font-bold text-red-300">
                [REJECTED]
              </span>
              {meta?.violationDelta?.attempted ??
                (interceptedCmd ? `AI attempted subnet drop: ${interceptedCmd}` : "AI rule failed safety threshold")}
            </div>
            <div className="break-all font-semibold leading-tight text-emerald-400">
              <span className="mr-1 rounded border border-emerald-800 bg-emerald-950 px-1 py-0.5 text-[9px] font-bold text-emerald-300">
                [ENFORCED]
              </span>
              {meta?.violationDelta?.enforced ?? `Playbook deployed surgical drop: ${exactRule}`}
            </div>
          </div>
        )}
      </div>

      {/* AI Reasoning */}
      <div className="mt-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          AI Reasoning
        </p>
        {meta?.l7Indicator && (
          <div className="mt-1 rounded border border-purple-800/70 bg-purple-950/40 px-2 py-1 font-mono text-[10px] text-purple-300">
            <span className="font-bold text-purple-400">L7 Payload Artifact: </span>
            <code>{meta.l7Indicator}</code>
          </div>
        )}
        <p className="mt-1 max-h-24 overflow-y-auto text-xs leading-relaxed text-zinc-300">
          AI Reasoning
        </p>
        <p className="mt-1 max-h-24 overflow-y-auto text-xs leading-relaxed text-zinc-300">
          {reasoning}
        </p>
      </div>

      {/* Netfilter Rule */}
      <div className="mt-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          Netfilter Rule
        </p>
        {cbTriggered && interceptedCmd && (
          <code className="mt-1 block break-all rounded border border-orange-900/60 bg-zinc-900/60 px-2.5 py-1 font-mono text-[10px] text-orange-400/80 line-through">
            {interceptedCmd}
          </code>
        )}
        <code className="mt-1 block break-all rounded border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-[11px] text-zinc-100">
          {exactRule}
        </code>
      </div>

      {errorMsg && (
        <p role="alert" className="mt-2 font-mono text-[11px] text-red-400">
          {errorMsg}
        </p>
      )}

      {/* Side-by-Side Accept / Reject */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={!!busy || closing}
          onClick={() => void handleDecision(true)}
          className="rounded-md border border-emerald-800 bg-emerald-700 py-2 text-center text-xs font-bold tracking-wide text-zinc-100 transition-colors hover:bg-emerald-600 active:bg-emerald-800 disabled:opacity-50"
        >
          {busy === "accept" ? "Enforcing..." : "Accept"}
        </button>
        <button
          type="button"
          disabled={!!busy || closing}
          onClick={() => void handleDecision(false)}
          className="rounded-md border border-zinc-700 bg-zinc-900 py-2 text-center text-xs font-bold tracking-wide text-zinc-300 transition-colors hover:border-red-800 hover:bg-red-950/60 hover:text-red-300 disabled:opacity-50"
        >
          {busy === "reject" ? "Rejecting..." : "Reject"}
        </button>
      </div>
    </aside>
  );
}
