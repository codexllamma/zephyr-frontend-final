"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Database } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Badge } from "@/components/ui/Badge";
import { Field, Panel, EmptyState } from "@/components/ui/Panel";
import { SearchInput, Select } from "@/components/ui/Fields";
import { Segmented } from "@/components/ui/Segmented";
import { services } from "@/lib/services";
import { actionLabel, fmtDateTime, fmtTime, REVIEW_LABEL, shortId, threatLabel, threatOptionsFrom } from "@/lib/format";
import { selectDecisions, selectTrainingPairs } from "@/lib/selectors";
import { cn } from "@/lib/cn";
import { ExecutionBadge, ReviewBadge } from "@/features/alerts/badges";
import type { ActionPayload, BenchmarkSnapshot, DecisionRecord, ReviewStatus, ThreatClass, TrainingPair } from "@/types";
import { BenchmarkPanel } from "./BenchmarkPanel";

type View = "pairs" | "decisions" | "benchmarks";

const act = (a: ActionPayload) => `${actionLabel(a.action_type)}${a.action_type === "NO_OP" ? "" : ` · ${a.target_container}:${a.dest_port}`}`;

export function TrainingView() {
  const { state, dispatch } = useDemo();
  const [view, setView] = useState<View>("pairs");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | ThreatClass>("all");
  const [rev, setRev] = useState<"all" | ReviewStatus>("all");
  const [selId, setSelId] = useState<string | null>(null);

  const pairs = useMemo(() => selectTrainingPairs(state.cases), [state.cases]);
  const threatOptions = threatOptionsFrom(state.cases.map((c) => c.attempts[0]?.envelope.threat_classification));
  const decisions = useMemo(() => selectDecisions(state.cases), [state.cases]);

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
  const fPairs = pairs.filter(
    (p) =>
      (cat === "all" || p.category === cat) &&
      (rev === "all" || p.reviewStatus === rev) &&
      (!needle || [p.id, p.alertId, p.decisionId, p.inputSummary, threatLabel(p.category)].join(" ").toLowerCase().includes(needle)),
  );
  const fDecisions = decisions.filter(
    (d) =>
      (cat === "all" || d.threatClass === cat) &&
      (rev === "all" || d.reviewerOutcome === rev) &&
      (!needle || [d.id, d.alertId, threatLabel(d.threatClass), d.chosenAction.action_type].join(" ").toLowerCase().includes(needle)),
  );

  const selectedPair = pairs.find((p) => p.alertId === selId) ?? null;
  const selectedDecision = decisions.find((d) => d.alertId === selId) ?? null;
  const selectedCase = state.cases.find((c) => c.id === selId) ?? null;
  const eligible = pairs.filter((p) => p.trainingEligible).length;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-fg-strong">Training &amp; Decisions</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Decisions recorded", decisions.length],
          ["Training pairs", pairs.length],
          ["Eligible for training", eligible],
          ["Excluded", pairs.length - eligible],
        ].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-border bg-surface px-3.5 py-3">
            <p className="text-[11px] uppercase tracking-wide text-subtle">{l}</p>
            <p className="mt-1 text-2xl font-semibold tabular text-fg-strong">{v}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Training view"
          value={view}
          onChange={setView}
          options={[
            { value: "pairs", label: "Training pairs", count: pairs.length },
            { value: "decisions", label: "Decision history", count: decisions.length },
            { value: "benchmarks", label: "Benchmarks" },
          ]}
        />
        {view !== "benchmarks" && (
          <>
            <SearchInput className="w-56" label="Search records" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select label="Filter by category" className="w-44" value={cat} onChange={(e) => setCat(e.target.value as typeof cat)}>
              <option value="all">All categories</option>
              {threatOptions.map((t) => <option key={t} value={t}>{threatLabel(t)}</option>)}
            </Select>
            <Select label="Filter by review status" className="w-44" value={rev} onChange={(e) => setRev(e.target.value as typeof rev)}>
              <option value="all">All review statuses</option>
              {(Object.keys(REVIEW_LABEL) as ReviewStatus[]).filter((s) => s !== "pending").map((s) => <option key={s} value={s}>{REVIEW_LABEL[s]}</option>)}
            </Select>
          </>
        )}
      </div>

      {view === "benchmarks" ? (
        <BenchmarkPanel snapshot={bench} error={benchError} />
      ) : (
        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <Panel bodyClassName="overflow-auto p-0" className="max-h-[70dvh]">
            {view === "pairs" ? (
              <PairsTable rows={fPairs} selId={selId} onSelect={setSelId} />
            ) : (
              <DecisionsTable rows={fDecisions} selId={selId} onSelect={setSelId} />
            )}
          </Panel>
          <Panel title="Record inspector">
            {!selectedCase || (!selectedPair && !selectedDecision) ? (
              <EmptyState icon={<Database aria-hidden className="size-6" />} title="Select a record" hint="Pick a row to compare the chosen and rejected actions and see why the pair is or is not training-eligible." />
            ) : (
              <Inspector pair={selectedPair} decision={selectedDecision} onOpen={() => dispatch({ type: "select_alert", id: selectedCase.id })} />
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: string }) {
  return <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{children}</th>;
}

function PairsTable({ rows, selId, onSelect }: { rows: TrainingPair[]; selId: string | null; onSelect: (id: string) => void }) {
  if (!rows.length) return <EmptyState title="No training pairs" hint="Pairs appear after a human reviews an alert. Adjust filters or review an alert." />;
  return (
    <table className="w-full min-w-[1000px] text-left text-xs">
      <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-wide text-subtle">
        <tr><Th>Pair ID</Th><Th>Timestamp</Th><Th>Category</Th><Th>Input summary</Th><Th>Chosen</Th><Th>Rejected</Th><Th>Reward</Th><Th>Critic</Th><Th>Model</Th><Th>Review</Th></tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} aria-selected={p.alertId === selId} className={cn("border-t border-border align-top", p.alertId === selId ? "bg-accent-soft" : "hover:bg-hover")}>
            <td className="px-3 py-2">
              <button type="button" className="whitespace-nowrap font-mono text-fg-strong hover:underline" onClick={() => onSelect(p.alertId)} aria-label={`Inspect ${p.id}`}>{p.id}</button>
            </td>
            <td className="px-3 py-2 font-mono text-[11px] text-muted">{fmtTime(p.timestamp)}</td>
            <td className="px-3 py-2">{threatLabel(p.category)}</td>
            <td className="max-w-[260px] px-3 py-2 text-muted"><span className="line-clamp-2">{p.inputSummary}</span></td>
            <td className="px-3 py-2">{act(p.chosen)}</td>
            <td className="px-3 py-2 text-muted">{act(p.rejected)}</td>
            <td className="px-3 py-2 font-mono tabular">{p.reward ? p.reward.total_reward.toFixed(1) : "—"}</td>
            <td className="px-3 py-2"><Badge tone={p.criticOutcome === "passed" ? "success" : p.criticOutcome === "not_reported" ? "neutral" : "danger"}>{p.criticOutcome === "passed" ? "Passed" : p.criticOutcome === "not_reported" ? "Not reported" : "Failed"}</Badge></td>
            <td className="px-3 py-2 font-mono text-[11px] text-muted">{p.modelVersion}</td>
            <td className="px-3 py-2"><ReviewBadge status={p.reviewStatus} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DecisionsTable({ rows, selId, onSelect }: { rows: DecisionRecord[]; selId: string | null; onSelect: (id: string) => void }) {
  if (!rows.length) return <EmptyState title="No decisions recorded" hint="Decisions appear after a human reviews an alert. Adjust filters or review an alert." />;
  return (
    <table className="w-full min-w-[1000px] text-left text-xs">
      <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-wide text-subtle">
        <tr><Th>Decision</Th><Th>Alert</Th><Th>Threat</Th><Th>Proposed</Th><Th>Chosen</Th><Th>Rejected alt.</Th><Th>Critic</Th><Th>Reviewer</Th><Th>Execution</Th><Th>Time</Th></tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.id} aria-selected={d.alertId === selId} className={cn("border-t border-border align-top", d.alertId === selId ? "bg-accent-soft" : "hover:bg-hover")}>
            <td className="px-3 py-2">
              <button type="button" className="whitespace-nowrap font-mono text-fg-strong hover:underline" onClick={() => onSelect(d.alertId)} aria-label={`Inspect ${d.id}`}>{d.id}</button>
            </td>
            <td className="px-3 py-2 font-mono">{shortId(d.alertId)}</td>
            <td className="px-3 py-2">{threatLabel(d.threatClass)}</td>
            <td className="px-3 py-2">{act(d.proposedAction)}</td>
            <td className="px-3 py-2">{act(d.chosenAction)}</td>
            <td className="px-3 py-2 text-muted">{act(d.rejectedAlternative)}</td>
            <td className="px-3 py-2"><Badge tone={d.criticResult === "passed" ? "success" : "danger"}>{d.criticResult === "passed" ? "Passed" : "Failed"}</Badge></td>
            <td className="px-3 py-2"><ReviewBadge status={d.reviewerOutcome} /></td>
            <td className="px-3 py-2"><ExecutionBadge status={d.executionStatus} /></td>
            <td className="px-3 py-2 font-mono text-[11px] text-muted">{fmtTime(d.timestamp)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Inspector({ pair, decision, onOpen }: { pair: TrainingPair | null; decision: DecisionRecord | null; onOpen: () => void }) {
  const alertId = (pair?.alertId ?? decision?.alertId) as string;
  const chosen = pair?.chosen ?? decision?.chosenAction;
  const rejected = pair?.rejected ?? decision?.rejectedAlternative;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3">
        <Field label="Alert" mono>{shortId(alertId)}</Field>
        <Field label="Decision" mono>{pair?.decisionId ?? decision?.id}</Field>
        {pair && <Field label="Training pair" mono>{pair.id}</Field>}
        {pair && <Field label="Recorded">{fmtDateTime(pair.timestamp)}</Field>}
      </dl>
      {chosen && rejected && (
        <div className="grid gap-2">
          <div className="rounded-md border border-success p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-success">Chosen</p>
            <p className="text-[13px] text-fg">{act(chosen)}</p>
            <code className="mt-1 block break-all font-mono text-[11px] text-muted">{chosen.iptables_cmd}</code>
          </div>
          <div className="rounded-md border border-dashed border-border-strong p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Rejected</p>
            <p className="text-[13px] text-fg">{act(rejected)}</p>
            <code className="mt-1 block break-all font-mono text-[11px] text-muted">{rejected.iptables_cmd}</code>
          </div>
        </div>
      )}
      {pair && (
        <>
          <p className="text-xs text-muted"><span className="font-medium text-fg">Why rejected: </span>{pair.rejectionReason}</p>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Schema">{pair.reward ? pair.reward.schema_compliance_score.toFixed(1) : "—"}</Field>
            <Field label="Grounding">{pair.reward ? pair.reward.entity_grounding_score.toFixed(1) : "—"}</Field>
            <Field label="Precision">{pair.reward ? pair.reward.surgical_precision_score.toFixed(1) : "—"}</Field>
            <Field label="Total">{pair.reward ? pair.reward.total_reward.toFixed(1) : "—"}</Field>
          </dl>
          <div className={cn("rounded-md px-2.5 py-2 text-xs", pair.trainingEligible ? "bg-success-soft text-fg" : "bg-warning-soft text-fg")}>
            <strong>{pair.trainingEligible ? "Eligible for training. " : "Not eligible. "}</strong>
            {pair.eligibilityNote}
          </div>
        </>
      )}
      {decision && (
        <div className="flex flex-wrap gap-2"><ReviewBadge status={decision.reviewerOutcome} /><ExecutionBadge status={decision.executionStatus} /></div>
      )}
      <Link href="/alerts" onClick={onOpen} className="inline-block text-xs text-accent hover:underline">Open this alert in Alerts &amp; Review</Link>
    </div>
  );
}
