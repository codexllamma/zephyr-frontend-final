"use client";

import { useMemo, useRef, useState } from "react";
import {
  Background,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useDemo } from "@/components/providers/DemoProvider";
import { Badge, type Tone } from "@/components/ui/Badge";
import { CameraHud } from "@/components/ui/CameraHud";
import { Field, Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/cn";
import { LOCKED_CAMERA_PROPS, useScrollCamera } from "@/hooks/useScrollCamera";
import type { Bounds, CameraStop } from "@/lib/camera";
import { shortId } from "@/lib/format";
import { currentAttempt } from "@/lib/selectors";
import {
  ARCH_EDGES,
  ARCH_NODES,
  LAYERS,
  reachedNodes,
  type ArchKind,
  type ArchNodeDef,
} from "@/data/architecture";
import type { ImplementationStatus } from "@/types";

const KIND_BORDER: Record<ArchKind, string> = {
  data: "border-accent",
  ai: "border-border-strong",
  validation: "border-warning",
  execution: "border-success",
  learning: "border-feedback",
};
const KIND_EDGE: Record<string, string> = {
  data: "edge-data",
  ai: "edge-data",
  validation: "edge-validation",
  execution: "edge-execution",
  learning: "edge-learning",
  danger: "edge-danger",
};
const STATUS: Record<ImplementationStatus, { label: string; tone: Tone }> = {
  demo: { label: "Implemented in demo", tone: "success" },
  simulated: { label: "Simulated", tone: "warning" },
  planned: { label: "Planned · not in demo", tone: "neutral" },
};

const COL = 290;
const ROW = 104;
const NODE_W = 220;
const TOP = 66;
const REGION_W = 250;
const REGION_H = 3 * ROW + TOP + 90;

interface ArchData extends Record<string, unknown> {
  def: ArchNodeDef;
  selected: boolean;
  dim: boolean;
}
interface RegionData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  boundary: boolean;
}

function ArchNode({ data }: NodeProps<Node<ArchData>>) {
  const { def, selected, dim } = data;
  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-surface px-3 py-2.5 text-left shadow-sm transition-opacity",
        KIND_BORDER[def.kind],
        def.status === "planned" && "border-dashed",
        selected && "outline outline-2 outline-offset-2 outline-[var(--accent)]",
        dim && "opacity-35",
      )}
      style={{ width: NODE_W }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <p className="text-[13px] font-semibold leading-tight text-fg-strong">{def.title}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted">{def.subtitle}</p>
      <div className="mt-1.5">
        <Badge tone={STATUS[def.status].tone}>{STATUS[def.status].label}</Badge>
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

function RegionNode({ data }: NodeProps<Node<RegionData>>) {
  return (
    <div
      className={cn(
        "h-full w-full rounded-xl border px-3 pt-2",
        data.boundary ? "border-2 border-warning bg-warning-soft" : "border-border bg-elevated/40",
      )}
    >
      <p className={cn("text-[12px] font-semibold uppercase tracking-wide", data.boundary ? "text-warning" : "text-muted")}>{data.title}</p>
      <p className="text-[11px] text-subtle">{data.subtitle}</p>
    </div>
  );
}

const nodeTypes: NodeTypes = { arch: ArchNode, region: RegionNode };

const BOUNDS: Bounds = { x: -20, y: 0, width: 5 * COL + REGION_W + 40, height: REGION_H };
const centerOf = (id: string) => {
  const d = ARCH_NODES.find((n) => n.id === id) as ArchNodeDef;
  return { x: (d.layer - 1) * COL + NODE_W / 2, y: TOP + d.row * ROW + 36 };
};
/** Overview (implicit, t=0) -> NIDS alert (0.3) -> model proposal (0.6) -> deterministic Critic / safety gate (1.0). */
const STOPS: CameraStop[] = [
  { t: 0.3, ...centerOf("alert"), zoom: 1.1, label: "Perception · NIDSAlert" },
  { t: 0.6, ...centerOf("envelope"), zoom: 1.1, label: "AI · MitigationEnvelope" },
  { t: 1, ...centerOf("critic"), zoom: 1.35, label: "Safety gate · Deterministic Critic" },
];

function Diagram({ selectedId, onSelect, reached }: { selectedId: string | null; onSelect: (id: string | null) => void; reached: Set<string> | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const { onInit, hud } = useScrollCamera({ containerRef: ref, stops: STOPS, bounds: BOUNDS });

  const { nodes, edges } = useMemo(() => {
    const regions: Node[] = LAYERS.map((l) => ({
      id: `region-${l.n}`,
      type: "region",
      position: { x: (l.n - 1) * COL - 20, y: 0 },
      data: { title: `${l.n}. ${l.title}`, subtitle: l.subtitle, boundary: !!l.boundary } satisfies RegionData,
      style: { width: REGION_W + 20, height: REGION_H },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
    }));
    const comps: Node[] = ARCH_NODES.map((d) => ({
      id: d.id,
      type: "arch",
      position: { x: (d.layer - 1) * COL, y: TOP + d.row * ROW },
      data: { def: d, selected: d.id === selectedId, dim: reached ? !reached.has(d.id) : false } satisfies ArchData,
      draggable: false,
    }));
    const es: Edge[] = ARCH_EDGES.map((e) => {
      const dim = reached ? !(reached.has(e.from) && reached.has(e.to)) : false;
      return {
        id: e.id,
        source: e.from,
        target: e.to,
        label: e.label,
        type: "smoothstep",
        className: cn(KIND_EDGE[e.kind], e.animated && !dim && "edge-flow", dim && "edge-dim"),
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        selectable: false,
        focusable: false,
      } satisfies Edge;
    });
    return { nodes: [...regions, ...comps], edges: es };
  }, [selectedId, reached]);

  return (
    <div ref={ref} className="relative h-[560px] w-full overflow-hidden rounded-lg border border-border bg-bg canvas-grid" role="group" aria-label="Zephyr architecture diagram, left to right in six layers. The camera tours the nodes automatically; click to pause or resume, scroll to steer.">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        {...LOCKED_CAMERA_PROPS}
        minZoom={0.1}
        maxZoom={3}
        onInit={onInit}
        onNodeClick={(_, n) => n.type === "arch" && onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} size={1} />
      </ReactFlow>
      <CameraHud progress={hud.progress} label={hud.label} playing={hud.playing} />
    </div>
  );
}

export function ArchitectureView() {
  const { state } = useDemo();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trace, setTrace] = useState(false);

  const selectedCase = state.cases.find((c) => c.id === state.selectedAlertId) ?? null;
  const reached = useMemo(
    () => (trace && selectedCase ? reachedNodes(selectedCase.stage, selectedCase.attempts.length > 1 || (currentAttempt(selectedCase)?.passed === false)) : null),
    [trace, selectedCase],
  );
  const def = ARCH_NODES.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-fg-strong">Architecture</h1>
          <p className="text-sm font-medium text-fg">Probabilistic reasoning proposes the action. Deterministic code enforces the execution boundary.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          {(Object.keys(STATUS) as ImplementationStatus[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5"><Badge tone={STATUS[k].tone}>{STATUS[k].label}</Badge></span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={trace} onChange={(e) => setTrace(e.target.checked)} disabled={!selectedCase} className="size-4 accent-[var(--accent)]" />
          <span className="text-fg">Trace selected alert</span>
        </label>
        <span className="text-muted">
          {selectedCase
            ? <>Alert <span className="font-mono text-fg">{shortId(selectedCase.id)}</span> is at stage <strong className="text-fg">{selectedCase.stage.replace("_", " ")}</strong>; unreached components are dimmed.</>
            : "Select an alert in Alerts & Review or Simulation to trace it through the layers."}
        </span>
        <span className="ml-auto hidden items-center gap-3 sm:flex">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-accent" />data</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-warning" />validation</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-success" />execution</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-feedback" />learning</span>
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <ReactFlowProvider>
          <Diagram selectedId={selectedId} onSelect={setSelectedId} reached={reached} />
        </ReactFlowProvider>
        <Panel title="Component inspector">
          {!def ? (
            <p className="text-xs text-muted">Click a component in the diagram to see its role, inputs, outputs and whether this demo implements it.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-fg-strong">{def.title}</p>
                <p className="text-xs text-muted">{def.subtitle}</p>
              </div>
              <Badge tone={STATUS[def.status].tone}>{STATUS[def.status].label}</Badge>
              <p className="text-[13px] text-fg">{def.role}</p>
              <dl className="grid gap-3">
                <Field label="Inputs">{def.inputs.join(" · ")}</Field>
                <Field label="Outputs">{def.outputs.join(" · ")}</Field>
                <Field label="Layer">{LAYERS[def.layer - 1].title}</Field>
              </dl>
              {def.note && <p className="rounded-md bg-elevated px-2.5 py-2 text-xs text-muted">{def.note}</p>}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
