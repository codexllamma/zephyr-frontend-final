"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Panel, EmptyState } from "@/components/ui/Panel";
import { SearchInput, Select } from "@/components/ui/Fields";
import { Badge } from "@/components/ui/Badge";
import { fmtTime, shortId, STAGE_LABEL, threatLabel, threatOptionsFrom } from "@/lib/format";
import { currentAttempt, sortedByNewest } from "@/lib/selectors";
import { cn } from "@/lib/cn";
import type { AlertCase, LifecycleStage, Severity, ThreatClass } from "@/types";
import { AlertDetail } from "./AlertDetail";
import { AlertSummaryRow } from "./AlertSummaryRow";
import { SeverityBadge, StageBadge } from "./badges";

type SortKey = "newest" | "oldest" | "severity";
const SEV_RANK: Record<Severity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

function threatOf(c: AlertCase): ThreatClass | undefined {
  return currentAttempt(c)?.envelope.threat_classification;
}

export function AlertsView() {
  const { state, dispatch } = useDemo();
  const [q, setQ] = useState("");
  const [sev, setSev] = useState<"all" | Severity>("all");
  const [threat, setThreat] = useState<"all" | ThreatClass>("all");
  const [stage, setStage] = useState<"all" | LifecycleStage>("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = sortedByNewest(state.cases).filter((c) => {
      const a = c.alert;
      if (sev !== "all" && a.nids_llm_assessment.severity !== sev) return false;
      if (threat !== "all" && threatOf(c) !== threat) return false;
      if (stage !== "all" && c.stage !== stage) return false;
      if (!needle) return true;
      const t = threatOf(c);
      return [c.id, a.source_ip, a.target_ip, a.source_node, a.target_node, String(a.dest_port), a.protocol, a.nids_llm_assessment.attack_signature, t ? threatLabel(t) : ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    if (sort === "oldest") list = [...list].reverse();
    if (sort === "severity") list = [...list].sort((x, y) => SEV_RANK[y.alert.nids_llm_assessment.severity] - SEV_RANK[x.alert.nids_llm_assessment.severity]);
    return list;
  }, [state.cases, q, sev, threat, stage, sort]);

  // Opening this tab acknowledges live critical alerts, which stops the blinking indicator.
  useEffect(() => {
    const ids = state.cases
      .filter((c) => c.isLive && c.alert.nids_llm_assessment.severity === "CRITICAL")
      .map((c) => c.id);
    if (ids.length) dispatch({ type: "ack_alerts", ids });
  }, [state.cases, dispatch]);

  const threatOptions = threatOptionsFrom(state.cases.map((c) => c.attempts[0]?.envelope.threat_classification));
  const selected = state.cases.find((c) => c.id === state.selectedAlertId) ?? null;
  const pending = state.cases.filter((c) => c.stage === "awaiting_review").length;

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-fg-strong">Alerts &amp; Review</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state.mode === "live" && (
            <Badge tone={state.backend.link === "online" ? "success" : state.backend.link === "error" ? "danger" : "warning"}>
              <span role="status">
                {state.backend.link === "online" ? "Live backend" : state.backend.link === "error" ? `Backend unreachable${state.backend.error ? `: ${state.backend.error}` : ""}` : "Connecting to backend…"}
              </span>
            </Badge>
          )}
          <Badge tone={pending ? "warning" : "success"}>{pending} awaiting review</Badge>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel title={`Alerts (${rows.length})`} className="lg:max-h-[calc(100dvh-11rem)]" bodyClassName="flex min-h-0 flex-col">
          <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-border p-3">
            <SearchInput className="col-span-2" label="Search ID, IP, port, threat" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select label="Filter by severity" value={sev} onChange={(e) => setSev(e.target.value as typeof sev)}>
              <option value="all">All severities</option>
              {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as Severity[]).map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select label="Filter by threat class" value={threat} onChange={(e) => setThreat(e.target.value as typeof threat)}>
              <option value="all">All threat classes</option>
              {threatOptions.map((t) => <option key={t} value={t}>{threatLabel(t)}</option>)}
            </Select>
            <Select label="Filter by review status" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}>
              <option value="all">All statuses</option>
              {(Object.keys(STAGE_LABEL) as LifecycleStage[]).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </Select>
            <Select label="Sort alerts" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="severity">Highest severity</option>
            </Select>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {rows.length === 0 ? (
              <EmptyState icon={<Inbox aria-hidden className="size-6" />} title="No alerts match" hint={state.mode === "live" ? (state.backend.link === "online" ? "The backend has no pending alerts. Launch an attack in the Simulation tab, or clear the filters." : "Waiting for the backend. Alerts appear here as soon as it responds.") : "Clear the search or filters, or run a scenario in the Simulation tab to generate new alerts."} />
            ) : (
              <div className="divide-y divide-border">
                {rows.map((c) => (
                  <AlertSummaryRow
                    key={c.id}
                    c={c}
                    selected={c.id === state.selectedAlertId}
                    onSelect={(id) => dispatch({ type: "select_alert", id })}
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>

        <div className="min-w-0">
          {selected ? (
            <AlertDetail c={selected} />
          ) : (
            <Panel>
              <EmptyState icon={<Inbox aria-hidden className="size-6" />} title="Select an alert" hint="Choose a row to see the evidence, the Critic's validation and the review controls." />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
