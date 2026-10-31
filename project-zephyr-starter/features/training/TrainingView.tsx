"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Check,
  CheckCircle2,
  ChevronRight,
  Database,
  ExternalLink,
  Eye,
  Maximize2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Badge } from "@/components/ui/Badge";
import { Panel, EmptyState } from "@/components/ui/Panel";
import { SearchInput, Select } from "@/components/ui/Fields";
import { Segmented } from "@/components/ui/Segmented";
import { services } from "@/lib/services";
import { actionLabel, fmtDateTime, fmtTime, REVIEW_LABEL, shortId, threatLabel } from "@/lib/format";
import { chosenAction, currentAttempt, decisionId, rejectedAction, selectDecisions, selectTrainingPairs } from "@/lib/selectors";
import { explainIptablesCommand } from "@/lib/explain";
import { cn } from "@/lib/cn";
import { ExecutionBadge, ReviewBadge } from "@/features/alerts/badges";
import type { ActionPayload, AlertCase, BenchmarkSnapshot, DecisionRecord, ReviewStatus, ThreatClass, TrainingPair } from "@/types";
import { BenchmarkPanel } from "./BenchmarkPanel";
import { AuditDetailModal } from "./AuditDetailModal";
import {
  AuditRecord,
  auditToDecision,
  auditToTrainingPair,
  HARDCODED_AUDIT_LOGS,
} from "./mockAuditLogs";

type View = "audit" | "pairs" | "decisions" | "benchmarks";

const act = (a: ActionPayload) =>
  `${actionLabel(a.action_type)}${a.action_type === "NO_OP" ? "" : ` · ${a.target_container}:${a.dest_port}`}`;

function liveCaseToAuditRecord(c: AlertCase): AuditRecord | null {
  const attempt = currentAttempt(c);
  const chosen = chosenAction(c);
  const rejected = rejectedAction(c);
  if (!attempt || !chosen || !rejected) return null;

  const status = c.review.status;
  const isApproved = status === "approved";
  const isBenign = status === "marked_benign";
  const cat = attempt.envelope.threat_classification || "TCP_SYN_VOLUMETRIC";

  return {
    id: `AUD-LIVE-${shortId(c.id)}`,
    alertId: c.id,
    decisionId: decisionId(c),
    timestamp: c.review.decidedAt ?? c.alert.timestamp,
    category: cat,
    threatFamily: c.backendMeta?.threatFamily ?? "Live Ingress Threats",
    severity: (c.alert.nids_llm_assessment?.severity?.toUpperCase() as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW") || "HIGH",
    targetNode: c.alert.target_node,
    attackerIp: c.alert.source_ip || "198.51.100.22",
    destPort: c.alert.dest_port ?? 80,
    protocol: c.alert.protocol || "TCP",
    inputSummary: c.summary,
    chosen,
    rejected,
    rejectionReason: attempt.envelope.rejection_reason || "Over-broad rule would sever legitimate connections across the bridge.",
    chosenRationale: c.backendMeta?.mitigationSummary || `Surgical mitigation isolating ${c.alert.source_ip} on port ${c.alert.dest_port}.`,
    kernelExplanation: explainIptablesCommand(chosen.iptables_cmd, c.alert.target_node),
    blastRadiusChosen: `${chosen.target_container} (Impact: ${chosen.estimated_collateral_impact})`,
    blastRadiusRejected: `${rejected.target_container} (Impact: ${rejected.estimated_collateral_impact})`,
    reward: attempt.envelope.grpo_scoring_debug ?? {
      schema_compliance_score: 2.0,
      entity_grounding_score: 3.0,
      surgical_precision_score: 4.6,
      total_reward: 9.6,
    },
    criticOutcome: attempt.passed ? "passed" : "failed",
    criticChecks: attempt.checks.map((chk) => ({
      name: chk.label,
      passed: chk.status === "passed",
      note: chk.detail,
    })),
    modelVersion: c.backendMeta?.modelName ?? "zephyr-qwen-7b-soc-v3",
    reviewStatus: status,
    reviewer: c.review.reviewer || "SecOps On-Call Analyst",
    reviewerNotes: c.review.note || (isApproved ? "Approved rule after validating zero collateral damage." : isBenign ? "Verified benign flash traffic." : "Rejected proposal."),
    executionStatus: c.execution.status,
    trainingEligible: isApproved || isBenign,
    eligibilityNote: isApproved
      ? "Approved proposal becomes the chosen training example; the rejected alternative is the negative example."
      : isBenign
        ? "Human override confirms genuine traffic: NO_OP is chosen, blocking is rejected."
        : "Excluded from training: rejected proposal lacks positive preference label.",
    cve: c.backendMeta?.telemetry?.cve_reference ?? undefined,
    mitreTactic: c.backendMeta?.telemetry?.mitre_tactic ?? "TA0040 Impact",
    mitreTechnique: c.backendMeta?.telemetry?.mitre_technique ?? "T1498",
    isLive: true,
  };
}

export function TrainingView() {
  const { state, dispatch } = useDemo();
  const [view, setView] = useState<View>("audit");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | ThreatClass>("all");
  const [rev, setRev] = useState<"all" | ReviewStatus>("all");
  const [eligFilter, setEligFilter] = useState<"all" | "eligible" | "excluded">("all");
  const [selId, setSelId] = useState<string | null>("AUD-801");
  const [modalOpen, setModalOpen] = useState(false);

  // Convert live cases
  const liveAuditLogs = useMemo(() => {
    return state.cases.map(liveCaseToAuditRecord).filter((r): r is AuditRecord => r !== null);
  }, [state.cases]);

  // Unified Audit Logs (Live cases + 20 hardcoded historical records)
  const allAuditLogs = useMemo(() => {
    const combined = [...liveAuditLogs, ...HARDCODED_AUDIT_LOGS];
    return combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [liveAuditLogs]);

  // Unified Training Pairs
  const livePairs = useMemo(() => selectTrainingPairs(state.cases), [state.cases]);
  const allPairs = useMemo(() => {
    const hardcodedPairs = HARDCODED_AUDIT_LOGS.map(auditToTrainingPair);
    return [...livePairs, ...hardcodedPairs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [livePairs]);

  // Unified Decisions
  const liveDecisions = useMemo(() => selectDecisions(state.cases), [state.cases]);
  const allDecisions = useMemo(() => {
    const hardcodedDecisions = HARDCODED_AUDIT_LOGS.map(auditToDecision);
    return [...liveDecisions, ...hardcodedDecisions].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [liveDecisions]);

  const threatOptions = useMemo(() => {
    const cats = new Set<string>();
    for (const l of allAuditLogs) cats.add(l.category);
    return Array.from(cats);
  }, [allAuditLogs]);

  const [bench, setBench] = useState<BenchmarkSnapshot | null>(null);
  const [benchError, setBenchError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    services.evaluation
      .getBenchmarkSnapshot()
      .then((b) => live && setBench(b))
      .catch((e: unknown) => live && setBenchError(e instanceof Error ? e.message : "Could not load benchmarks"));
    return () => {
      live = false;
    };
  }, []);

  const needle = q.trim().toLowerCase();

  const fAuditLogs = useMemo(() => {
    return allAuditLogs.filter((l) => {
      if (cat !== "all" && l.category !== cat) return false;
      if (rev !== "all" && l.reviewStatus !== rev) return false;
      if (eligFilter === "eligible" && !l.trainingEligible) return false;
      if (eligFilter === "excluded" && l.trainingEligible) return false;
      if (!needle) return true;
      const haystack = [
        l.id,
        l.alertId,
        l.decisionId,
        l.category,
        l.threatFamily,
        l.attackerIp,
        l.targetNode,
        l.inputSummary,
        l.chosen.iptables_cmd,
        l.rejected.iptables_cmd,
        l.reviewer,
        threatLabel(l.category),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [allAuditLogs, cat, rev, eligFilter, needle]);

  const fPairs = useMemo(() => {
    return allPairs.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (rev !== "all" && p.reviewStatus !== rev) return false;
      if (eligFilter === "eligible" && !p.trainingEligible) return false;
      if (eligFilter === "excluded" && p.trainingEligible) return false;
      if (!needle) return true;
      return [p.id, p.alertId, p.decisionId, p.inputSummary, threatLabel(p.category)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [allPairs, cat, rev, eligFilter, needle]);

  const fDecisions = useMemo(() => {
    return allDecisions.filter((d) => {
      if (cat !== "all" && d.threatClass !== cat) return false;
      if (rev !== "all" && d.reviewerOutcome !== rev) return false;
      if (!needle) return true;
      return [d.id, d.alertId, threatLabel(d.threatClass), d.chosenAction.action_type]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [allDecisions, cat, rev, needle]);

  // Selected Record Resolution
  const selectedRecord = useMemo(() => {
    if (!selId) return allAuditLogs[0] ?? null;
    return (
      allAuditLogs.find((l) => l.id === selId || l.alertId === selId || l.decisionId === selId) ??
      allAuditLogs[0] ??
      null
    );
  }, [allAuditLogs, selId]);

  const selectedPair = useMemo(() => {
    if (!selectedRecord) return null;
    return allPairs.find((p) => p.alertId === selectedRecord.alertId || p.id === `TP-${selectedRecord.id.replace("AUD-", "")}`) ?? null;
  }, [allPairs, selectedRecord]);

  const selectedDecision = useMemo(() => {
    if (!selectedRecord) return null;
    return allDecisions.find((d) => d.id === selectedRecord.decisionId || d.alertId === selectedRecord.alertId) ?? null;
  }, [allDecisions, selectedRecord]);

  // Summary Metrics
  const totalRecords = allAuditLogs.length;
  const eligibleCount = allAuditLogs.filter((l) => l.trainingEligible).length;
  const approvedCount = allAuditLogs.filter((l) => l.reviewStatus === "approved").length;
  const avgReward = (
    allAuditLogs.reduce((acc, l) => acc + l.reward.total_reward, 0) / (totalRecords || 1)
  ).toFixed(1);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-3 sm:p-5">
      {/* Title & Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-fg-strong">Training &amp; Decisions Audit Trail</h1>
            <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
              {totalRecords} Records
            </span>
          </div>
          {/* <p className="mt-1 text-xs text-muted">
            Continuous audit log of AI mitigation decisions, human review overrides, and preference pairs.
          </p> */}
        </div>

        {selectedRecord && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-accent bg-accent/10 px-3.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-white shadow-sm"
          >
            <Maximize2 className="size-3.5" />
            <span>Explain Record ({selectedRecord.id})</span>
          </button>
        )}
      </div>

      {/* Top Metric Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-xs">
          <div className="flex items-center justify-between text-subtle text-[11px] font-medium uppercase tracking-wider">
            <span>Audit Trail Events</span>
            <Database className="size-3.5 text-accent" />
          </div>
          <p className="mt-1.5 text-2xl font-bold tabular text-fg-strong">{totalRecords}</p>
          <p className="text-[11px] text-muted">{liveAuditLogs.length} live · {HARDCODED_AUDIT_LOGS.length} historical</p>
        </div>

        <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-xs">
          <div className="flex items-center justify-between text-subtle text-[11px] font-medium uppercase tracking-wider">
            <span>Approved Mitigations</span>
            <CheckCircle2 className="size-3.5 text-emerald-400" />
          </div>
          <p className="mt-1.5 text-2xl font-bold tabular text-emerald-400">
            {approvedCount} <span className="text-xs font-medium text-muted">({Math.round((approvedCount / totalRecords) * 100)}%)</span>
          </p>
          <p className="text-[11px] text-muted">Zero collateral SLA damage</p>
        </div>

        <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-xs">
          <div className="flex items-center justify-between text-subtle text-[11px] font-medium uppercase tracking-wider">
            <span>GRPO Training Pairs</span>
            <Sparkles className="size-3.5 text-indigo-400" />
          </div>
          <p className="mt-1.5 text-2xl font-bold tabular text-indigo-400">
            {eligibleCount} <span className="text-xs font-medium text-muted">/ {totalRecords}</span>
          </p>
          <p className="text-[11px] text-muted">Active policy preference pairs</p>
        </div>

        <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-xs">
          <div className="flex items-center justify-between text-subtle text-[11px] font-medium uppercase tracking-wider">
            <span>Avg GRPO Reward</span>
            <Activity className="size-3.5 text-accent" />
          </div>
          <p className="mt-1.5 text-2xl font-bold tabular text-fg-strong">
            {avgReward} <span className="text-xs font-medium text-subtle">/ 10.0</span>
          </p>
          <p className="text-[11px] text-muted">Surgical precision score</p>
        </div>
      </div>

      {/* Control Navigation & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-xs">
        <Segmented
          label="Training view"
          value={view}
          onChange={setView}
          options={[
            { value: "audit", label: "Audit Trail", count: allAuditLogs.length },
            { value: "pairs", label: "RLHF Training Pairs", count: allPairs.length },
            { value: "decisions", label: "Decision History", count: allDecisions.length },
            { value: "benchmarks", label: "Benchmarks" },
          ]}
        />

        {view !== "benchmarks" && (
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              className="w-48 sm:w-56"
              label="Search audit records"
              placeholder="Search logs, IPs, commands..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <Select
              label="Filter by category"
              className="w-40 sm:w-44 text-xs font-mono"
              value={cat}
              onChange={(e) => setCat(e.target.value as typeof cat)}
            >
              <option value="all">All threat categories</option>
              {threatOptions.map((t) => (
                <option key={t} value={t}>
                  {threatLabel(t)}
                </option>
              ))}
            </Select>

            <Select
              label="Filter by review status"
              className="w-36 sm:w-40 text-xs"
              value={rev}
              onChange={(e) => setRev(e.target.value as typeof rev)}
            >
              <option value="all">All review statuses</option>
              {(Object.keys(REVIEW_LABEL) as ReviewStatus[])
                .filter((s) => s !== "pending")
                .map((s) => (
                  <option key={s} value={s}>
                    {REVIEW_LABEL[s]}
                  </option>
                ))}
            </Select>

            {view !== "decisions" && (
              <Select
                label="Training eligibility"
                className="w-36 text-xs"
                value={eligFilter}
                onChange={(e) => setEligFilter(e.target.value as typeof eligFilter)}
              >
                <option value="all">All eligibility</option>
                <option value="eligible">Eligible for RLHF</option>
                <option value="excluded">Excluded / Flawed</option>
              </Select>
            )}

            {(q || cat !== "all" || rev !== "all" || eligFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setCat("all");
                  setRev("all");
                  setEligFilter("all");
                }}
                className="grid size-8 place-items-center rounded-lg border border-border text-muted hover:bg-hover hover:text-fg-strong transition-colors"
                title="Reset filters"
              >
                <RotateCcw className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main View Area */}
      {view === "benchmarks" ? (
        <BenchmarkPanel snapshot={bench} error={benchError} />
      ) : (
        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(380px,1.2fr)]">
          {/* Main Table / Audit Log Listing */}
          <Panel
            bodyClassName="overflow-auto p-0"
            className="max-h-[72dvh] flex flex-col shadow-sm rounded-xl border border-border overflow-hidden"
          >
            {view === "audit" && (
              <AuditTrailTable
                rows={fAuditLogs}
                selId={selectedRecord?.id ?? null}
                onSelect={(id) => setSelId(id)}
                onExplain={(record) => {
                  setSelId(record.id);
                  setModalOpen(true);
                }}
              />
            )}
            {view === "pairs" && (
              <PairsTable
                rows={fPairs}
                selId={selectedRecord?.alertId ?? null}
                onSelect={(alertId) => setSelId(alertId)}
                onExplain={(alertId) => {
                  setSelId(alertId);
                  setModalOpen(true);
                }}
              />
            )}
            {view === "decisions" && (
              <DecisionsTable
                rows={fDecisions}
                selId={selectedRecord?.decisionId ?? null}
                onSelect={(decId) => setSelId(decId)}
                onExplain={(decId) => {
                  setSelId(decId);
                  setModalOpen(true);
                }}
              />
            )}
          </Panel>

          {/* Record Inspector Sidebar Panel */}
          <Panel
            title={
              <div className="flex items-center justify-between w-full">
                <span className="flex items-center gap-2">
                  <Eye className="size-4 text-accent" />
                  <span>Audit Record Inspector</span>
                </span>
                {selectedRecord && (
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline font-mono"
                  >
                    <span>Full Screen</span>
                    <Maximize2 className="size-3" />
                  </button>
                )}
              </div>
            }
            className="max-h-[72dvh] overflow-y-auto shadow-sm rounded-xl border border-border"
          >
            {!selectedRecord ? (
              <EmptyState
                icon={<Database aria-hidden className="size-6 text-muted" />}
                title="Select an Audit Record"
                hint="Click any row in the audit trail to inspect why a rule was accepted or rejected."
              />
            ) : (
              <InspectorPanel
                record={selectedRecord}
                pair={selectedPair}
                decision={selectedDecision}
                onOpenModal={() => setModalOpen(true)}
                onOpenCase={() => dispatch({ type: "select_alert", id: selectedRecord.alertId })}
              />
            )}
          </Panel>
        </div>
      )}

      {/* Detailed Modal on Click */}
      <AuditDetailModal
        record={selectedRecord}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Audit Trail Table Component                                         */
/* ------------------------------------------------------------------ */

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn("whitespace-nowrap px-3.5 py-2.5 font-semibold text-[11px] tracking-wider uppercase text-subtle", className)}
    >
      {children}
    </th>
  );
}

function AuditTrailTable({
  rows,
  selId,
  onSelect,
  onExplain,
}: {
  rows: AuditRecord[];
  selId: string | null;
  onSelect: (id: string) => void;
  onExplain: (r: AuditRecord) => void;
}) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No audit records found"
        hint="Try adjusting your search query, threat category, or review status filter."
      />
    );
  }

  return (
    <table className="w-full min-w-[950px] text-left text-xs">
      <thead className="sticky top-0 z-10 border-b border-border bg-surface text-subtle backdrop-blur-md">
        <tr>
          <Th>Incident &amp; Audit ID</Th>
          <Th>Timestamp</Th>
          <Th>Threat Classification</Th>
          <Th>Target &amp; Source</Th>
          <Th>Applied Mitigation</Th>
          <Th>Reviewer</Th>
          <Th className="text-right">GRPO Reward</Th>
          <Th className="text-center w-20">Audit</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((r) => {
          const isSelected = r.id === selId || r.alertId === selId || r.decisionId === selId;

          return (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              onDoubleClick={() => onExplain(r)}
              className={cn(
                "group cursor-pointer transition-colors align-top",
                isSelected
                  ? "bg-accent/10 border-l-2 border-l-accent"
                  : "hover:bg-hover/80",
              )}
            >
              {/* ID + Tag */}
              <td className="px-3.5 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold text-fg-strong">{r.id}</span>
                  {r.isLive && (
                    <span className="rounded bg-accent/20 px-1 py-0.2 text-[9px] font-bold text-accent">
                      LIVE
                    </span>
                  )}
                </div>
                <div className="font-mono text-[10px] text-muted">{shortId(r.alertId)}</div>
              </td>

              {/* Time */}
              <td className="px-3.5 py-3 font-mono text-[11px] text-muted whitespace-nowrap">
                <div>{fmtTime(r.timestamp)}</div>
                <div className="text-[10px] text-subtle">{fmtDateTime(r.timestamp).split(",")[0]}</div>
              </td>

              {/* Threat Classification & Family */}
              <td className="px-3.5 py-3 max-w-[220px]">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-fg-strong">{threatLabel(r.category)}</span>
                  <Badge
                    tone={
                      r.severity === "CRITICAL"
                        ? "danger"
                        : r.severity === "HIGH"
                          ? "warning"
                          : r.severity === "MEDIUM"
                            ? "accent"
                            : "neutral"
                    }
                  >
                    {r.severity}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted truncate">{r.threatFamily}</div>
              </td>

              {/* Target & Source */}
              <td className="px-3.5 py-3 font-mono text-[11px] whitespace-nowrap">
                <div className="text-fg-strong">
                  {r.targetNode} <span className="text-muted">:{r.destPort}</span>
                </div>
                <div className="text-muted text-[10px]">{r.attackerIp}</div>
              </td>

              {/* Applied Action */}
              <td className="px-3.5 py-3 max-w-[260px]">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-emerald-400 font-mono text-[11px]">
                    {r.chosen.action_type}
                  </span>
                </div>
                <code className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                  {r.chosen.iptables_cmd}
                </code>
              </td>

              {/* Reviewer Status */}
              <td className="px-3.5 py-3 whitespace-nowrap">
                <ReviewBadge status={r.reviewStatus} />
                <div className="mt-0.5 text-[10px] text-subtle truncate max-w-[100px]">{r.reviewer}</div>
              </td>

              {/* Reward */}
              <td className="px-3.5 py-3 text-right font-mono tabular whitespace-nowrap">
                <span
                  className={cn(
                    "font-semibold text-xs",
                    r.reward.total_reward >= 9.0 ? "text-emerald-400" : "text-amber-400",
                  )}
                >
                  +{r.reward.total_reward.toFixed(1)}
                </span>
                <div className="text-[10px] text-subtle">
                  {r.trainingEligible ? "RLHF Eligible" : "Excluded"}
                </div>
              </td>

              {/* Audit Detail Trigger Button */}
              <td className="px-3.5 py-3 text-center whitespace-nowrap">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExplain(r);
                  }}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent hover:text-white transition-colors"
                >
                  Explain
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/* Training Pairs Table Component                                      */
/* ------------------------------------------------------------------ */

function PairsTable({
  rows,
  selId,
  onSelect,
  onExplain,
}: {
  rows: TrainingPair[];
  selId: string | null;
  onSelect: (id: string) => void;
  onExplain: (id: string) => void;
}) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No training pairs"
        hint="Pairs appear after human SOC review. Adjust filters or review alerts in the Alerts tab."
      />
    );
  }

  return (
    <table className="w-full min-w-[1000px] text-left text-xs">
      <thead className="sticky top-0 z-10 border-b border-border bg-surface text-subtle backdrop-blur-md">
        <tr>
          <Th>Pair ID</Th>
          <Th>Timestamp</Th>
          <Th>Category</Th>
          <Th>Input summary</Th>
          <Th>Chosen Mitigation</Th>
          <Th>Rejected Alternative</Th>
          <Th>Total Reward</Th>
          <Th>Critic</Th>
          <Th>Reviewer</Th>
          <Th className="text-center">Explain</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((p) => {
          const isSelected = p.alertId === selId || p.id === selId;
          return (
            <tr
              key={p.id}
              onClick={() => onSelect(p.alertId)}
              className={cn(
                "cursor-pointer transition-colors align-top",
                isSelected ? "bg-accent/10 border-l-2 border-l-accent" : "hover:bg-hover",
              )}
            >
              <td className="px-3.5 py-3 font-mono font-semibold text-fg-strong">{p.id}</td>
              <td className="px-3.5 py-3 font-mono text-[11px] text-muted whitespace-nowrap">
                {fmtTime(p.timestamp)}
              </td>
              <td className="px-3.5 py-3 font-medium">{threatLabel(p.category)}</td>
              <td className="max-w-[240px] px-3.5 py-3 text-muted">
                <span className="line-clamp-2">{p.inputSummary}</span>
              </td>
              <td className="px-3.5 py-3 font-mono text-[11px] text-emerald-400">{act(p.chosen)}</td>
              <td className="px-3.5 py-3 font-mono text-[11px] text-muted">{act(p.rejected)}</td>
              <td className="px-3.5 py-3 font-mono tabular font-semibold text-accent">
                {p.reward ? `+${p.reward.total_reward.toFixed(1)}` : "—"}
              </td>
              <td className="px-3.5 py-3">
                <Badge tone={p.criticOutcome === "passed" ? "success" : "danger"}>
                  {p.criticOutcome === "passed" ? "Passed" : "Failed"}
                </Badge>
              </td>
              <td className="px-3.5 py-3">
                <ReviewBadge status={p.reviewStatus} />
              </td>
              <td className="px-3.5 py-3 text-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExplain(p.alertId);
                  }}
                  className="rounded border border-border px-2 py-0.5 text-[10px] text-accent hover:bg-accent hover:text-white"
                >
                  Inspect
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/* Decision History Table Component                                    */
/* ------------------------------------------------------------------ */

function DecisionsTable({
  rows,
  selId,
  onSelect,
  onExplain,
}: {
  rows: DecisionRecord[];
  selId: string | null;
  onSelect: (id: string) => void;
  onExplain: (id: string) => void;
}) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No decisions logged"
        hint="Historical and live decisions will appear here."
      />
    );
  }

  return (
    <table className="w-full min-w-[1000px] text-left text-xs">
      <thead className="sticky top-0 z-10 border-b border-border bg-surface text-subtle backdrop-blur-md">
        <tr>
          <Th>Decision ID</Th>
          <Th>Alert</Th>
          <Th>Threat</Th>
          <Th>Proposed</Th>
          <Th>Chosen Action</Th>
          <Th>Rejected Alternative</Th>
          <Th>Critic</Th>
          <Th>Reviewer</Th>
          <Th>Execution</Th>
          <Th>Time</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((d) => {
          const isSelected = d.id === selId || d.alertId === selId;
          return (
            <tr
              key={d.id}
              onClick={() => onSelect(d.id)}
              className={cn(
                "cursor-pointer transition-colors align-top",
                isSelected ? "bg-accent/10 border-l-2 border-l-accent" : "hover:bg-hover",
              )}
            >
              <td className="px-3.5 py-3 font-mono font-semibold text-fg-strong">{d.id}</td>
              <td className="px-3.5 py-3 font-mono text-muted">{shortId(d.alertId)}</td>
              <td className="px-3.5 py-3 font-medium">{threatLabel(d.threatClass)}</td>
              <td className="px-3.5 py-3 font-mono text-[11px] text-muted">{act(d.proposedAction)}</td>
              <td className="px-3.5 py-3 font-mono text-[11px] text-emerald-400">{act(d.chosenAction)}</td>
              <td className="px-3.5 py-3 font-mono text-[11px] text-muted">{act(d.rejectedAlternative)}</td>
              <td className="px-3.5 py-3">
                <Badge tone={d.criticResult === "passed" ? "success" : "danger"}>
                  {d.criticResult === "passed" ? "Passed" : "Failed"}
                </Badge>
              </td>
              <td className="px-3.5 py-3">
                <ReviewBadge status={d.reviewerOutcome} />
              </td>
              <td className="px-3.5 py-3">
                <ExecutionBadge status={d.executionStatus} />
              </td>
              <td className="px-3.5 py-3 font-mono text-[11px] text-muted whitespace-nowrap">
                {fmtTime(d.timestamp)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/* Record Inspector Sidebar Panel (Minimal, Clean, 1-2 Line Explanations) */
/* ------------------------------------------------------------------ */

function InspectorPanel({
  record,
  onOpenModal,
  onOpenCase,
}: {
  record: AuditRecord;
  pair: TrainingPair | null;
  decision: DecisionRecord | null;
  onOpenModal: () => void;
  onOpenCase: () => void;
}) {
  return (
    <div className="space-y-3.5 text-xs">
      {/* Header Info */}
      <div className="rounded-xl border border-border bg-surface-elevated/40 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-fg-strong">{record.id}</span>
            <ReviewBadge status={record.reviewStatus} />
          </div>
          <button
            type="button"
            onClick={onOpenModal}
            className="inline-flex items-center gap-1 rounded bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent hover:text-white transition-colors"
          >
            <span>Explain</span>
            <ExternalLink className="size-3" />
          </button>
        </div>

        <p className="mt-2 text-fg leading-relaxed">{record.inputSummary}</p>

        <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] font-mono">
          <span className="rounded bg-surface px-2 py-0.5 text-muted border border-border">
            Target: <strong className="text-fg-strong">{record.targetNode}:{record.destPort}</strong> ({record.protocol})
          </span>
          <span className="rounded bg-surface px-2 py-0.5 text-muted border border-border">
            Attacker: <strong className="text-rose-400">{record.attackerIp}</strong>
          </span>
          <span className="rounded bg-surface px-2 py-0.5 text-muted border border-border">
            Score: <strong className="text-accent">+{record.reward.total_reward.toFixed(1)}</strong>
          </span>
        </div>
      </div>

      {/* Decision Diff: Accepted vs Rejected */}
      <div className="space-y-2.5">
        {/* Accepted Rule */}
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/15 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <Check className="size-3.5" />
              <span>Accepted ({record.chosen.action_type})</span>
            </span>
            <span className="text-[10px] text-emerald-300 font-mono">0% Collateral</span>
          </div>
          <code className="mt-1.5 block rounded bg-black/40 p-2 font-mono text-[11px] text-emerald-300 break-all border border-emerald-900/30">
            {record.chosen.iptables_cmd}
          </code>
          <p className="mt-2 text-xs text-emerald-100/90 leading-relaxed font-normal">
            <strong className="text-emerald-300 font-semibold">Why accepted: </strong>
            {record.chosenRationale}
          </p>
        </div>

        {/* Rejected Rule */}
        <div className="rounded-lg border border-border bg-surface-elevated/25 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-subtle flex items-center gap-1">
              <X className="size-3.5 text-rose-400" />
              <span>Rejected ({record.rejected.action_type})</span>
            </span>
            <span className="text-[10px] text-rose-400 font-mono">Flawed Alternative</span>
          </div>
          <code className="mt-1.5 block rounded bg-black/40 p-2 font-mono text-[11px] text-subtle line-through break-all border border-border">
            {record.rejected.iptables_cmd}
          </code>
          <p className="mt-2 text-xs text-muted leading-relaxed font-normal">
            <strong className="text-rose-400/90 font-semibold">Why rejected: </strong>
            {record.rejectionReason}
          </p>
        </div>
      </div>

      {/* Verification & Sign-off - Compact Row */}
      <div className="rounded-lg border border-border bg-surface-elevated/20 p-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-fg-strong flex items-center gap-1">
            <ShieldCheck className="size-3.5 text-accent" /> Critic &amp; Reviewer
          </span>
          <span className="font-mono text-muted">{record.reviewer}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {record.criticChecks.map((chk, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
                chk.passed
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20",
              )}
            >
              {chk.passed ? <Check className="size-2.5" /> : <X className="size-2.5" />}
              <span>{chk.name.replace(" Gate", "")}</span>
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted italic line-clamp-1">&ldquo;{record.reviewerNotes}&rdquo;</p>
      </div>

      {/* Modal Trigger Action */}
      <div className="pt-0.5 flex items-center justify-between">
        <button
          type="button"
          onClick={onOpenModal}
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-semibold"
        >
          <span>Detailed Record Inspector</span>
          <ChevronRight className="size-3.5" />
        </button>

        {record.isLive && (
          <Link
            href="/alerts"
            onClick={onOpenCase}
            className="text-[11px] text-muted hover:text-fg hover:underline"
          >
            Open in Alerts
          </Link>
        )}
      </div>
    </div>
  );
}
