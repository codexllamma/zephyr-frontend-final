"use client";

import { useDemo } from "@/components/providers/DemoProvider";
import { Badge } from "@/components/ui/Badge";
import { Field, Panel } from "@/components/ui/Panel";
import { Term } from "@/components/ui/Tooltip";
import { fmtBytes, fmtDateTime, fmtInt, shortId } from "@/lib/format";
import { DEVICE_BY_ID } from "@/data/devices";
import type { AlertCase } from "@/types";
import { SeverityBadge, StageBadge } from "./badges";
import { ExplainPanel } from "./ExplainPanel";
import { TelemetryBadges } from "./TelemetryBadges";
import { LiveReviewControls } from "./LiveReviewControls";
import { LifecycleStepper } from "./LifecycleStepper";
import { MitigationPanel } from "./MitigationPanel";
import { ReviewControls } from "./ReviewControls";

export function AlertDetail({ c }: { c: AlertCase }) {
  const { state } = useDemo();
  const a = c.alert;
  const m = a.flow_metrics;
  const n = a.nids_llm_assessment;
  const target = DEVICE_BY_ID[a.target_node];
  return (
    <div className="space-y-4">
      <Panel
        title={
          <span className="flex flex-wrap items-center gap-2">
            Alert <span className="font-mono text-xs text-muted">{shortId(c.id)}</span>
            <SeverityBadge severity={n.severity} />
            <StageBadge stage={c.stage} />
            {c.provenance === "backend" ? <Badge tone="accent">Live backend</Badge> : c.isLive && <Badge tone="accent">Live this session</Badge>}
          </span>
        }
      >
        <div className="space-y-4">
          <LifecycleStepper stage={c.stage} />
          <p className="text-[13px] text-fg">{c.summary}</p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Detected">{fmtDateTime(a.timestamp)}</Field>
            <Field label="Source" mono>{a.source_node} · {a.source_ip}</Field>
            <Field label="Destination" mono>{a.target_node} · {a.target_ip}</Field>
            <Field label="Protocol / port" mono>{a.protocol ?? "not reported"} / {a.dest_port}</Field>
            <Field label="Target role">{state.devices[a.target_node]?.role ?? (c.provenance === "backend" ? "not reported" : target?.role)}</Field>
            <Field label="NIDS signature">{n.attack_signature}</Field>
            {m && <Field label="Packets (2 s)">{fmtInt(m.packet_count_2s)}</Field>}
            {m && <Field label="Bytes (2 s)">{fmtBytes(m.byte_count_2s)}</Field>}
            {m && <Field label="SYN ratio">{Math.round(m.syn_ratio * 100)}%</Field>}
            {n.confidence_score !== undefined && <Field label="Confidence">{Math.round(n.confidence_score * 100)}%</Field>}
            {n.mitre_technique_id && <Field label="MITRE" mono>{n.mitre_technique_id}</Field>}
            {n.mitre_tactic && <Field label="Tactic">{n.mitre_tactic}</Field>}
          </dl>
          <p className="text-xs text-muted">
            {c.provenance === "backend" ? (
              <>Reported by the live backend. Fields it does not send (MITRE mapping, per-check Critic results) are omitted rather than estimated.</>
            ) : (
              <>Detected by the <Term k="nids">NIDS</Term> over a 2-second window. IPs are illustrative demo addresses on <span className="font-mono">br-zephyr</span>.</>
            )}
          </p>
        </div>
      </Panel>

      {c.backendMeta && (
        <Panel title="Telemetry vector">
          <TelemetryBadges c={c} />
        </Panel>
      )}

      <Panel title="Why it was flagged: evidence">
        <ul className="space-y-1.5">
          {c.evidence.map((e) => (
            <li key={e.label} className="flex items-start justify-between gap-3 text-[13px]">
              <span className="text-muted">{e.label}</span>
              <span className="flex items-center gap-2 text-right text-fg">
                {e.value}
                {e.signal && e.signal !== "neutral" && <Badge tone={e.signal === "suspicious" ? "danger" : "success"}>{e.signal}</Badge>}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Mitigation proposal">
        <MitigationPanel c={c} />
      </Panel>

      <Panel title="Human review" actions={<span className="text-[11px] text-subtle">Reviewer: Admin3</span>}>
        {c.provenance === "backend" ? <LiveReviewControls key={c.id} c={c} /> : <ReviewControls c={c} />}
        {c.execution.message && (
          <p className="mt-3 rounded-md bg-elevated px-2.5 py-2 text-xs text-muted">
            {c.execution.message} {c.provenance !== "backend" && c.execution.simulated && c.execution.status === "confirmed" && <strong className="text-fg">Simulated: no real container changed.</strong>}
          </p>
        )}
      </Panel>

      <Panel title="Explain the decision">
        <ExplainPanel c={c} />
      </Panel>
    </div>
  );
}
