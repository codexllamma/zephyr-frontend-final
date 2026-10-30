"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, HeartPulse, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/cn";
import { liveApi } from "@/lib/services/live";
import type { SlaHealth } from "@/types/backend";

const DEFAULT_TARGET = "pc-4";
const HEALTH_EVENT = "zephyr:health-now";

/** Trigger SLA health check immediately after a successful rule execution, passing the target node. */
export const requestHealthCheck = (targetNode: string = DEFAULT_TARGET) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(HEALTH_EVENT, { detail: { targetNode } }));
  }
};

/**
 * Zone 3 SLA Monitor: GET http://localhost:8000/api/v1/terminal/health?target_node={target}
 * Triggered immediately upon a 200 OK rule execution. Extracts `http_code` (200) and `healthy` (true)
 * to instantly render a green "SLA Intact" badge alongside the raw HTTP trace from `recent_logs`.
 */
export function SlaHeartbeat() {
  const [targetNode, setTargetNode] = useState<string>(DEFAULT_TARGET);
  const [data, setData] = useState<SlaHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runHealthProbe = useCallback(async (node: string) => {
    setTargetNode(node);
    setLoading(true);
    setError(null);
    try {
      const res = await liveApi.getHealth(node);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "SLA probe unreachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onHealthCheck = (e: Event) => {
      const custom = e as CustomEvent<{ targetNode?: string }>;
      const node = custom.detail?.targetNode || DEFAULT_TARGET;
      void runHealthProbe(node);
    };
    window.addEventListener(HEALTH_EVENT, onHealthCheck);
    return () => window.removeEventListener(HEALTH_EVENT, onHealthCheck);
  }, [runHealthProbe]);

  const healthy = !error && data?.healthy === true && data?.http_code === 200;
  const known = !error && data !== null;

  return (
    <Panel
      title="SLA Monitor (Benign Traffic Verification)"
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void runHealthProbe(targetNode)} disabled={loading}>
            <RefreshCw aria-hidden className={cn("size-3.5", loading && "animate-spin")} />
            {loading ? "Probing…" : `Probe ${targetNode}`}
          </Button>
          {healthy && <Badge tone="success">SLA Intact · HTTP {data.http_code}</Badge>}
        </div>
      }
    >
      {!known && !loading && !error ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border-strong bg-elevated/40 px-3 py-2.5 text-xs text-muted">
          <span className="flex items-center gap-2">
            <HeartPulse aria-hidden className="size-4 text-accent" />
            Waiting for rule execution — approve a mitigation in the HITL Queue to trigger the live SLA health probe on <code className="font-mono text-fg">{targetNode}</code>.
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span
              role="status"
              aria-label={`SLA status: ${healthy ? "SLA Intact" : "SLA Degraded"}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                healthy
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                  : error || known
                    ? "border-red-500/40 bg-red-500/15 text-red-400"
                    : "border-border bg-elevated text-muted",
              )}
            >
              {healthy ? (
                <CheckCircle2 aria-hidden className="size-4 text-emerald-400" />
              ) : (
                <ShieldAlert aria-hidden className="size-4 text-red-400" />
              )}
              {healthy ? "SLA Intact" : error ? "Probe Failed" : data?.status ?? "SLA Degraded"}
            </span>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-400">
              HTTP {data?.http_code ?? "—"}
            </span>
            <span className="font-mono text-xs text-fg">
              {data?.node ?? "traffic-gen"} ({data?.source_ip ?? "172.28.0.101"}) → {data?.target_node ?? targetNode} ({data?.target_ip ?? "172.28.0.15"})
            </span>
            {data?.latency_ms !== undefined && (
              <span className="text-xs text-muted">
                Latency <span className="font-mono tabular text-fg">{data.latency_ms.toFixed(1)} ms</span>
              </span>
            )}
            {data?.timestamp && <span className="text-[11px] text-subtle">verified at {data.timestamp} UTC</span>}
          </div>
          {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          {data?.recent_logs && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">Raw HTTP Trace (recent_logs)</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-emerald-500/30 bg-terminal-bg px-3 py-2 font-mono text-[11px] text-emerald-400">
                {data.recent_logs}
              </pre>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
