import { Badge } from "@/components/ui/Badge";
import type { AlertCase } from "@/types";

const fmt = (n: number | undefined, digits = 0) => (n === undefined ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits }));

/** Telemetry vector and model quality badges, straight from the backend payload. */
export function TelemetryBadges({ c }: { c: AlertCase }) {
  const meta = c.backendMeta;
  if (!meta) return null;
  const t = meta.telemetry;
  const q = meta.qScore;
  const items: { label: string; value: string; tone?: "danger" | "warning" | "success" | "neutral" }[] = [
    { label: "Packet rate", value: t?.packet_rate_pps !== undefined ? `${fmt(t.packet_rate_pps)} pps` : "—" },
    { label: "SYN/ACK ratio", value: fmt(t?.syn_ack_ratio, 2) },
    { label: "Payload entropy", value: fmt(t?.payload_entropy, 2) },
    { label: "Active sockets", value: fmt(t?.active_socket_count) },
    { label: "Byte rate", value: t?.byte_rate_bps !== undefined ? `${fmt(t.byte_rate_bps)} B/s` : "—" },
    { label: "Avg packet", value: t?.avg_packet_size !== undefined ? `${fmt(t.avg_packet_size)} B` : "—" },
    { label: "Anomaly confidence", value: t?.anomaly_confidence !== undefined ? `${Math.round(t.anomaly_confidence * 100)}%` : "—" },
    {
      label: "Q-score",
      value: q !== undefined ? q.toFixed(2) : "—",
      tone: q === undefined ? "neutral" : q >= 0.75 ? "success" : "danger",
    },
  ];
  return (
    <div>
      <ul className="flex flex-wrap gap-2" aria-label="Telemetry vector">
        {items.map((i) => (
          <li key={i.label} className="rounded-md border border-border bg-elevated px-2.5 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-subtle">{i.label}</p>
            <p className="flex items-center gap-1.5 font-mono text-[13px] font-semibold tabular text-fg-strong">
              {i.value}
              {i.label === "Q-score" && i.tone && i.tone !== "neutral" && <Badge tone={i.tone}>{i.tone === "success" ? "≥ 0.75" : "< 0.75"}</Badge>}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Model <span className="font-mono text-fg">{meta.modelName}</span>
        {meta.selectedVariant && <> · variant <span className="font-mono text-fg">{meta.selectedVariant}</span>{meta.variantLabel ? ` (${meta.variantLabel})` : ""}</>}
        {meta.postmortem?.postmortem_id && (
          <> · postmortem <span className="font-mono text-fg">{meta.postmortem.postmortem_id}</span>{meta.postmortem.learned_policy_override ? `: ${meta.postmortem.learned_policy_override}` : ""}</>
        )}
      </p>
    </div>
  );
}
