"use client";

import Link from "next/link";
import { useDemo } from "@/components/providers/DemoProvider";
import { Badge } from "@/components/ui/Badge";
import { Field, Panel } from "@/components/ui/Panel";
import { DEVICE_STATUS_META, StatusDot } from "@/components/ui/StatusDot";
import { Term } from "@/components/ui/Tooltip";
import { DEVICE_BY_ID } from "@/data/devices";
import { fmtInt, shortId } from "@/lib/format";
import { appliedRules } from "@/lib/selectors";
import type { TrafficPattern } from "@/types";

const PATTERN: Record<TrafficPattern, { label: string; tone: "accent" | "warning" | "danger" | "neutral" }> = {
  routine: { label: "Routine", tone: "accent" },
  surge: { label: "High volume", tone: "warning" },
  suspicious: { label: "Suspicious", tone: "danger" },
  blocked: { label: "Blocked", tone: "neutral" },
};

export function DeviceInspector() {
  const { state } = useDemo();
  const id = state.selectedDeviceId;
  const d = DEVICE_BY_ID[id];
  const rt = state.devices[id] ?? { status: "unknown" as const };
  const meta = DEVICE_STATUS_META[rt.status];
  const flows = state.flows.filter((f) => f.from === id || f.to === id);
  const alerts = state.cases.filter((c) => c.alert.target_node === id || c.alert.source_node === id);
  const rules = appliedRules(state.cases, id);
  return (
    <Panel title="Device inspector" actions={state.mode === "live" ? <Badge tone="accent">Reported by backend</Badge> : <Badge tone="warning">Illustrative IP</Badge>}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-sm font-semibold text-fg-strong">{d.name}</p>
            <p className="text-xs text-muted">{rt.role ?? d.role}</p>
          </div>
          <span className={`flex items-center gap-1.5 text-xs font-medium ${meta.text}`}>
            <StatusDot tone={meta.dot} /> {meta.label}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <Field label={state.mode === "live" ? "IP" : "IP (demo)"} mono>{rt.ip ?? (state.mode === "live" ? "not reported" : d.ip)}</Field>
          <Field label="Bridge" mono>br-zephyr</Field>
          <Field label="Services">{state.mode === "live" ? "Not reported" : d.services.join(", ")}</Field>
          <Field label={<Term k="container_namespace">Namespace rules</Term>}>{rules.length ? `${rules.length}${state.mode === "live" ? "" : " simulated"}` : state.mode === "live" ? "Not reported" : "None applied"}</Field>
        </dl>
        <div>
          <h3 className="mb-1 text-[11px] uppercase tracking-wide text-subtle">Active flows</h3>
          {flows.length === 0 ? (
            <p className="text-xs text-muted">No traffic flows involve this device.</p>
          ) : (
            <ul className="space-y-1">
              {flows.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-muted">{f.from} → {f.to}:{f.port}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="tabular text-fg">{f.pps > 0 ? `${fmtInt(f.pps)} pps` : "— pps"}</span>
                    <Badge tone={PATTERN[f.pattern].tone}>{PATTERN[f.pattern].label}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-1 text-[11px] uppercase tracking-wide text-subtle">Related alerts</h3>
          {alerts.length === 0 ? (
            <p className="text-xs text-muted">No alerts for this device.</p>
          ) : (
            <p className="text-xs text-muted">
              {alerts.length} alert{alerts.length > 1 ? "s" : ""}, latest <span className="font-mono text-fg">{shortId(alerts[alerts.length - 1].id)}</span>.{" "}
              <Link href="/alerts" className="text-accent hover:underline">Open Alerts &amp; Review</Link>
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
