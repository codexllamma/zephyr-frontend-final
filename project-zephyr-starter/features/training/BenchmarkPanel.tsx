import { Badge } from "@/components/ui/Badge";
import { EmptyState, Panel } from "@/components/ui/Panel";
import type { BenchmarkMetric, BenchmarkSnapshot } from "@/types";

function fmt(m: BenchmarkMetric, v: number | null): string {
  if (v === null) return "n/a";
  if (m.unit === "percent") return `${v.toFixed(1)}%`;
  if (m.unit === "seconds") return `${v.toFixed(2)} s`;
  return `+${v.toFixed(2)}`;
}

export function BenchmarkPanel({ snapshot, error }: { snapshot: BenchmarkSnapshot | null; error: string | null }) {
  if (error) return <Panel><EmptyState title="Benchmarks unavailable" hint={error} /></Panel>;
  if (!snapshot) return <Panel><p role="status" className="text-sm text-muted">Loading benchmark snapshot…</p></Panel>;
  return (
    <Panel
      title={snapshot.title}
      actions={<Badge tone="warning">Project-provided · not independently verified</Badge>}
      bodyClassName="space-y-4 p-3.5"
    >
      <div className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-xs text-fg">{snapshot.caveat}</div>
      <p className="text-xs text-muted">{snapshot.datasetDescription} {snapshot.environment}</p>
      <div className="overflow-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <caption className="sr-only">Benchmark metrics by configuration</caption>
          <thead className="text-[11px] uppercase tracking-wide text-subtle">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">Metric</th>
              {snapshot.configurations.map((c) => (
                <th key={c.id} scope="col" className="px-3 py-2 font-medium normal-case tracking-normal" title={c.description}>
                  <span className="text-[12px] text-fg">{c.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.metrics.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  <span className="text-fg">{m.label}</span>
                  {m.description && <span className="block text-[11px] text-subtle">{m.description}</span>}
                </th>
                {m.values.map((v, i) => (
                  <td key={snapshot.configurations[i].id} className="px-3 py-2 align-top font-mono tabular text-fg-strong">
                    {fmt(m, v)}
                    {m.secondaryValues && <span className="block text-[11px] text-muted">{m.secondaryLabel}: {fmt(m, m.secondaryValues[i])}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-subtle">A single evaluation snapshot, shown as a comparison of configurations, not a training curve. 100% on this dataset does not mean the system is 100% secure.</p>
    </Panel>
  );
}
