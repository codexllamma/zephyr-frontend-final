"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { requestHealthCheck } from "@/features/simulation/SlaHeartbeat";
import { markResolved, requestSync } from "@/hooks/useBackendSync";
import { cn } from "@/lib/cn";
import { liveApi } from "@/lib/services/live";
import { currentAttempt } from "@/lib/selectors";
import type { AlertCase } from "@/types";

interface SafetyFactor {
  id: string;
  label: string;
  category: string;
  maxPoints: number;
  earnedPoints: number;
  passed: boolean;
  desc: string;
}

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedRule, setCopiedRule] = useState(false);

  // 6-Factor Sequential Evaluation Animation State
  const [activeFactorIndex, setActiveFactorIndex] = useState(-1);
  const [checkedFactors, setCheckedFactors] = useState<number[]>([]);
  const [runningScore, setRunningScore] = useState(0);
  const [evaluationComplete, setEvaluationComplete] = useState(false);
  const [animatedProgress, setAnimatedProgress] = useState(0);

  const meta = pendingAlert.backendMeta;
  const isLive = meta?.executionMode === "live" || pendingAlert.provenance === "backend";
  const latencySec = meta?.latencySec ?? (isLive ? 5.2 : 14.0);
  const modelName = meta?.modelName || (isLive ? "zephyr-dpo-v3 (Kaggle GPU)" : "zephyr-dataset-playbook");
  const threshold = meta?.executionThreshold ?? 80;

  // Extract or compute deterministic scores for each of the 6 factors
  const factors: SafetyFactor[] = useMemo(() => {
    const gs = meta?.gateScores;
    const cb = meta?.circuitBreaker?.triggered;
    const cbReason = meta?.circuitBreaker?.reason ?? "";

    let syntax = gs?.syntax_validity ?? (cb && cbReason.includes("GRAMMAR") ? 0 : 20);
    let blast = gs?.blast_radius_scope ?? (cb && (cbReason.includes("BLAST") || cbReason.includes("/16")) ? 0 : 25);
    let target = gs?.target_coherence ?? 15;
    let proto = gs?.protocol_port_alignment ?? 15;
    let dir = gs?.directionality ?? 10;
    let action = gs?.action_severity ?? (meta?.isZeroDay ? 0 : 15);

    syntax = Math.max(0, Math.min(20, syntax));
    blast = Math.max(0, Math.min(25, blast));
    target = Math.max(0, Math.min(15, target));
    proto = Math.max(0, Math.min(15, proto));
    dir = Math.max(0, Math.min(10, dir));
    action = Math.max(0, Math.min(15, action));

    return [
      {
        id: "syntax_validity",
        label: "Syntax Validity",
        category: "Netfilter Regex",
        maxPoints: 20,
        earnedPoints: syntax,
        passed: syntax === 20,
        desc: syntax === 20 ? "Valid iptables syntax & arguments" : "Grammar check failed or unrecognized flags",
      },
      {
        id: "blast_radius_scope",
        label: "Blast Radius Scope",
        category: "CIDR /32 Scope",
        maxPoints: 25,
        earnedPoints: blast,
        passed: blast === 25,
        desc: blast === 25 ? "Surgical /32 isolation preserves SLA traffic" : "Blanket /16 subnet drop halts benign nodes",
      },
      {
        id: "target_coherence",
        label: "Target Coherence",
        category: "Entity Alignment",
        maxPoints: 15,
        earnedPoints: target,
        passed: target === 15,
        desc: target === 15 ? "Mitigation matches identified attacker IP" : "Attacker IP mismatch in candidate rule",
      },
      {
        id: "protocol_port_alignment",
        label: "Protocol Alignment",
        category: "L4 Port Match",
        maxPoints: 15,
        earnedPoints: proto,
        passed: proto === 15,
        desc: proto === 15 ? "Aligned with target transport protocol & port" : "Mismatched destination port or protocol",
      },
      {
        id: "directionality",
        label: "Directionality Check",
        category: "Netfilter Chain",
        maxPoints: 10,
        earnedPoints: dir,
        passed: dir === 10,
        desc: dir === 10 ? "Correct ingress chain placement (INPUT)" : "Incorrect chain selected for traffic flow",
      },
      {
        id: "action_severity",
        label: "Action Severity",
        category: "Impact Severity",
        maxPoints: 15,
        earnedPoints: action,
        passed: action === 15,
        desc: action === 15 ? "Proportional netfilter drop / rate limiting" : "Unmeasured blanket drop on unmapped anomaly",
      },
    ];
  }, [meta]);

  const finalScore = useMemo(() => {
    if (meta?.compositeScore !== undefined) {
      return Math.max(1, Math.min(100, Math.round(meta.compositeScore)));
    }
    return factors.reduce((sum, f) => sum + f.earnedPoints, 0);
  }, [meta, factors]);

  const passesSafetyThreshold = finalScore >= threshold && !meta?.circuitBreaker?.triggered && !meta?.isZeroDay;

  // Run sequential evaluation animation on mount or when pending alert changes
  useEffect(() => {
    setEntered(true);
    setActiveFactorIndex(0);
    setCheckedFactors([]);
    setRunningScore(0);
    setEvaluationComplete(false);
    setAnimatedProgress(0);

    const timeouts: number[] = [];
    const STEP_DELAY = 280; // 280ms per factor
    let currentScore = 0;

    factors.forEach((f, index) => {
      timeouts.push(
        window.setTimeout(() => {
          currentScore += f.earnedPoints;
          setRunningScore(currentScore);
          setCheckedFactors((prev) => [...prev, index]);
          if (index < factors.length - 1) {
            setActiveFactorIndex(index + 1);
          }
        }, (index + 1) * STEP_DELAY),
      );
    });

    // All factors completed
    const finalDelay = (factors.length + 0.5) * STEP_DELAY;
    timeouts.push(
      window.setTimeout(() => {
        setEvaluationComplete(true);
        setActiveFactorIndex(-1);
        setAnimatedProgress(finalScore);
      }, finalDelay),
    );

    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [pendingAlert.id, factors, finalScore]);

  const attempt = currentAttempt(pendingAlert);
  const a = pendingAlert.alert;
  const exactRule =
    attempt?.envelope.chosen_mitigation.iptables_cmd ||
    `iptables -A INPUT -s ${a.source_ip} -p ${(a.protocol ?? "tcp").toLowerCase()} --dport ${a.dest_port} -j DROP`;
  const interceptedCmd = pendingAlert.backendMeta?.circuitBreaker?.interceptedCmd;
  const reasoning =
    attempt?.envelope.reasoning_trace ||
    pendingAlert.summary ||
    `Anomalous ${a.nids_llm_assessment.attack_signature} traffic detected from ${a.source_ip} targeting ${a.target_node} (${a.target_ip}:${a.dest_port}). Surgical /32 netfilter rule isolates attacker while preserving internal SLA traffic.`;

  const handleCopyRule = async () => {
    try {
      await navigator.clipboard.writeText(exactRule);
      setCopiedRule(true);
      setTimeout(() => setCopiedRule(false), 2000);
    } catch {
      // fallback
    }
  };

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
      aria-label="Mitigation Decision Card"
      className={cn(
        "fixed bottom-6 right-6 z-50 w-[470px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-3rem)] overflow-y-auto rounded-xl border border-zinc-800/90 bg-[#0e1117] p-4 text-zinc-100 shadow-2xl transition-all duration-300 font-sans",
        entered && !closing
          ? "translate-y-0 opacity-100 ease-out"
          : "pointer-events-none translate-y-8 opacity-0 ease-in",
      )}
    >
      {/* 1. Header: Engine Provenance & Model */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block size-2 rounded-full",
              isLive ? "bg-emerald-400" : "bg-amber-400",
            )}
          />
          <span className="text-xs font-semibold tracking-wide text-zinc-200">
            {isLive ? "Live Kaggle Inference" : "Demo Playbook Engine"}
          </span>
          <span className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-400 font-mono">
            {latencySec.toFixed(2)}s
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[190px]">
          {modelName}
        </span>
      </div>

      {/* Zero-Day / Fail-Safe Notice if applicable */}
      {meta?.isZeroDay && (
        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
          <ShieldAlert className="size-4 shrink-0 text-amber-400" />
          <div className="leading-tight">
            <span className="font-semibold block">Fail-Safe Protocol Active</span>
            <span className="text-[11px] text-amber-300/80">
              Unmapped anomaly signature detected. Constrained to L4 rate-limiting fallback.
            </span>
          </div>
        </div>
      )}

      {/* Threat Summary & Routing */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert
            className={cn(
              "size-4 shrink-0",
              passesSafetyThreshold ? "text-emerald-400" : "text-amber-400",
            )}
          />
          <span className="truncate text-sm font-semibold text-zinc-100">
            {attempt?.envelope.threat_classification ?? a.nids_llm_assessment.attack_signature}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {meta?.ttlDisplay && (
            <span className="rounded-md border border-emerald-800/60 bg-emerald-950/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 font-mono">
              TTL: {meta.ttlDisplay}
            </span>
          )}
          <span className="rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
            {a.source_node} → {a.target_node}
          </span>
        </div>
      </div>

      {/* 2. The 6-Factor Safety Scoring Matrix */}
      <div className="mt-3.5 rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
          <div>
            <h4 className="text-xs font-semibold text-zinc-200">
              Composite Confidence Calculation
            </h4>
            <p className="text-[10px] text-zinc-400">
              Evaluating 6 Netfilter deterministic safety gates
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-zinc-400 block">Current Tally</span>
            <span
              className={cn(
                "font-mono text-xs font-bold",
                evaluationComplete
                  ? passesSafetyThreshold
                    ? "text-emerald-400"
                    : "text-amber-400"
                  : "text-zinc-200",
              )}
            >
              {runningScore} / 100 pts
            </span>
          </div>
        </div>

        {/* The 6 factors animated with checkmarks */}
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          {factors.map((f, idx) => {
            const isChecked = checkedFactors.includes(idx);
            const isCurrent = activeFactorIndex === idx;

            return (
              <div
                key={f.id}
                className={cn(
                  "flex items-center justify-between rounded-lg border p-2 transition-all duration-300",
                  isChecked
                    ? f.passed
                      ? "border-emerald-800/50 bg-emerald-950/25 text-zinc-200"
                      : "border-rose-800/50 bg-rose-950/30 text-zinc-200"
                    : isCurrent
                      ? "border-zinc-700 bg-zinc-800/80 text-zinc-300 shadow-sm"
                      : "border-zinc-800/40 bg-zinc-900/20 text-zinc-500",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isChecked ? (
                    f.passed ? (
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-900/80 text-emerald-300">
                        <Check className="size-2.5 stroke-[3]" />
                      </span>
                    ) : (
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-rose-900/80 text-rose-300">
                        <X className="size-2.5 stroke-[3]" />
                      </span>
                    )
                  ) : isCurrent ? (
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      <Loader2 className="size-3 animate-spin text-zinc-400" />
                    </span>
                  ) : (
                    <span className="size-4 shrink-0 rounded-full border border-zinc-700/60 bg-zinc-800/40" />
                  )}
                  <div className="truncate">
                    <span className="text-[11px] font-medium leading-none block truncate">
                      {f.label}
                    </span>
                    <span className="text-[9px] text-zinc-500 block truncate mt-0.5">
                      {f.category}
                    </span>
                  </div>
                </div>

                <div className="font-mono text-[10px] shrink-0 font-medium pl-1.5">
                  {isChecked ? (
                    f.passed ? (
                      <span className="text-emerald-400 font-semibold">+{f.earnedPoints}</span>
                    ) : (
                      <span className="text-rose-400 font-semibold">0/{f.maxPoints}</span>
                    )
                  ) : (
                    <span className="text-zinc-600">/{f.maxPoints}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 3. The Benchmark Progress Bar (reveals smoothly when all 6 factors are checked) */}
        <div className="mt-3.5 pt-2 border-t border-zinc-800/60">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-[11px] font-medium text-zinc-300">
              Confidence Score Bar
            </span>
            <span
              className={cn(
                "font-mono text-xs font-bold",
                evaluationComplete
                  ? passesSafetyThreshold
                    ? "text-emerald-400"
                    : "text-amber-400"
                  : "text-zinc-400",
              )}
            >
              {evaluationComplete ? `${finalScore}%` : `${runningScore}% (calculating)`}
            </span>
          </div>

          {/* Progress bar with distinct 80% threshold benchmark line */}
          <div className="relative pt-4 pb-1">
            {/* The benchmark notch and label */}
            <div
              className="absolute top-0 -translate-x-1/2 flex flex-col items-center z-20 pointer-events-none"
              style={{ left: "80%" }}
            >
              <span className="rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.2 text-[8px] font-semibold text-zinc-300 shadow-sm">
                80% Benchmark
              </span>
              <div className="w-0.5 h-1.5 bg-zinc-300" />
            </div>

            {/* The bar track */}
            <div className="relative h-3 w-full rounded-full bg-zinc-800/90 border border-zinc-700/60 overflow-hidden">
              {/* Vertical benchmark threshold line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-zinc-200 z-10"
                style={{ left: "80%" }}
              />

              {/* Animated fill track */}
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700 ease-out",
                  passesSafetyThreshold ? "bg-emerald-500" : "bg-amber-500",
                )}
                style={{ width: `${evaluationComplete ? animatedProgress : runningScore}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-zinc-500 mt-0.5 font-mono">
            <span>0%</span>
            <span className="text-zinc-400">80% Required Execution Threshold</span>
            <span>100%</span>
          </div>
        </div>

        {/* 4. Threshold Status Message */}
        {evaluationComplete && (
          <div className="mt-3 transition-opacity duration-300">
            {!passesSafetyThreshold ? (
              <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-2.5 text-xs text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-semibold block leading-tight">
                      Score ({finalScore}%) is below 80% Safety Threshold
                    </span>
                    <p className="mt-1 text-[11px] text-amber-300/80 leading-relaxed">
                      Circuit breaker engaged. Candidate rule failed blast radius / syntax gates.
                      Switching to verified <strong>Golden Playbook fallback</strong>.
                    </p>
                  </div>
                </div>

                {/* Explicit Delta Callout */}
                <div className="mt-2 space-y-1.5 rounded-md border border-zinc-800 bg-zinc-950/80 p-2 text-[11px] font-mono">
                  <div className="text-rose-400 break-all leading-tight">
                    <span className="mr-1.5 rounded bg-rose-950 px-1.5 py-0.5 text-[9px] font-bold text-rose-300 border border-rose-800/60">
                      REJECTED
                    </span>
                    {meta?.violationDelta?.attempted ??
                      (interceptedCmd
                        ? `AI attempted subnet drop: ${interceptedCmd}`
                        : "AI rule failed safety threshold")}
                  </div>
                  <div className="text-emerald-400 break-all leading-tight">
                    <span className="mr-1.5 rounded bg-emerald-950 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 border border-emerald-800/60">
                      ENFORCED
                    </span>
                    {meta?.violationDelta?.enforced ?? `Playbook deployed surgical drop: ${exactRule}`}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/25 p-2.5 text-xs text-emerald-200">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
                  <div>
                    <span className="font-semibold block leading-tight">
                      Confidence ({finalScore}%) satisfies Safety Threshold (≥ 80%)
                    </span>
                    <span className="text-[11px] text-emerald-300/80 block mt-0.5">
                      All 6 Netfilter safety gates verified. Rule approved for autonomous enforcement.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. AI Reasoning & Indicators */}
      <div className="mt-3">
        <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500 block">
          AI Reasoning & Vector Analysis
        </span>
        {meta?.l7Indicator && (
          <div className="mt-1.5 rounded-md border border-purple-800/60 bg-purple-950/30 px-2 py-1 text-[11px] font-mono text-purple-300">
            <span className="font-semibold text-purple-400">Layer-7 Indicator: </span>
            <code>{meta.l7Indicator}</code>
          </div>
        )}
        <p className="mt-1 max-h-20 overflow-y-auto text-xs leading-relaxed text-zinc-300 bg-zinc-900/40 rounded-lg p-2 border border-zinc-800/60">
          {reasoning}
        </p>
      </div>

      {/* 6. Enforced Netfilter Rule Box */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
          <span className="uppercase font-semibold tracking-wider">
            Enforced Netfilter Rule
          </span>
          <button
            type="button"
            onClick={() => void handleCopyRule()}
            className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200"
          >
            {copiedRule ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
            {copiedRule ? "Copied" : "Copy"}
          </button>
        </div>
        <code className="block break-all rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-2 font-mono text-[11px] text-zinc-200 selection:bg-emerald-900">
          {exactRule}
        </code>
      </div>

      {errorMsg && (
        <p role="alert" className="mt-2 text-xs text-rose-400 font-sans">
          {errorMsg}
        </p>
      )}

      {/* 7. Action Buttons */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={!!busy || closing}
          onClick={() => void handleDecision(true)}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 py-2.5 text-center text-xs font-semibold tracking-wide text-white transition-colors shadow-sm disabled:opacity-50"
        >
          {busy === "accept" ? "Enforcing..." : "Accept & Enforce"}
        </button>
        <button
          type="button"
          disabled={!!busy || closing}
          onClick={() => void handleDecision(false)}
          className="rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:text-zinc-100 active:bg-zinc-850 py-2.5 text-center text-xs font-semibold tracking-wide text-zinc-300 transition-colors disabled:opacity-50"
        >
          {busy === "reject" ? "Rejecting..." : "Reject"}
        </button>
      </div>
    </aside>
  );
}
