"use client";

import { useMemo, useRef } from "react";
import {
  Background,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { CameraHud } from "@/components/ui/CameraHud";
import { LOCKED_CAMERA_PROPS, useScrollCamera } from "@/hooks/useScrollCamera";
import type { Bounds, CameraStop } from "@/lib/camera";
import { Activity, Cloud, Database, FolderLock, Globe, Monitor, Network, Terminal, type LucideIcon } from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { DEVICE_STATUS_META, StatusDot } from "@/components/ui/StatusDot";
import { DEVICES } from "@/data/devices";
import { cn } from "@/lib/cn";
import { DEVICE_IDS, EXT_NODE_IDS, type DeviceId, type DeviceRuntime, type DeviceStatus, type ExtNodeId, type NetworkFlow, type NodeId, type TrafficPattern } from "@/types";

const ICONS: Record<NodeId, LucideIcon> = { "pc-1": FolderLock, "pc-2": Database, "pc-3": Globe, "pc-4": Terminal, "pc-5": Monitor, "ext-net": Cloud, "traffic-gen": Activity };
const EXT_ROLE: Record<ExtNodeId, string> = { "ext-net": "External attacker network", "traffic-gen": "Legitimate traffic generator" };

interface DeviceNodeData extends Record<string, unknown> {
  id: NodeId;
  ip: string;
  role: string;
  status: DeviceStatus;
  selected: boolean;
}

const hidden = { left: "50%", top: "50%", opacity: 0, pointerEvents: "none" as const };

function DeviceNode({ data }: NodeProps<Node<DeviceNodeData>>) {
  const Icon = ICONS[data.id];
  const meta = DEVICE_STATUS_META[data.status];
  const ring =
    data.status === "healthy" || data.status === "unknown" ? "border-border" : data.status === "under_review" || data.status === "blocked" ? "border-warning" : data.status === "mitigated" ? "border-success" : "border-danger";
  return (
    <div
      className={cn(
        "w-[150px] rounded-lg border bg-surface px-3 py-2.5 text-left shadow-sm",
        ring,
        data.selected && "outline outline-2 outline-offset-2 outline-[var(--accent)]",
      )}
    >
      <Handle type="target" position={Position.Top} style={hidden} isConnectable={false} />
      <Handle type="source" position={Position.Top} style={hidden} isConnectable={false} />
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-md bg-elevated text-muted">
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[13px] font-semibold text-fg-strong">{data.id}</p>
          <p className="truncate text-[10px] text-subtle">{data.ip}</p>
        </div>
      </div>
      <p className={cn("mt-2 flex items-center gap-1.5 text-[11px] font-medium", meta.text)}>
        <StatusDot tone={meta.dot} /> {meta.label}
      </p>
    </div>
  );
}

function BridgeNode() {
  const { state } = useDemo();
  return (
    <div className="w-[130px] rounded-full border border-accent bg-surface px-3 py-2.5 text-center [background-image:linear-gradient(var(--accent-soft),var(--accent-soft))]">
      <Handle type="target" position={Position.Top} style={hidden} isConnectable={false} />
      <Handle type="source" position={Position.Top} style={hidden} isConnectable={false} />
      <Network aria-hidden className="mx-auto size-4 text-accent" />
      <p className="font-mono text-[12px] font-semibold text-fg-strong">br-zephyr</p>
      <p className="text-[10px] text-muted">{state.mode === "live" ? "bridge" : "bridge · demo"}</p>
    </div>
  );
}

const nodeTypes: NodeTypes = { device: DeviceNode, bridge: BridgeNode };

// Hub-and-spoke layout around the bridge (centre).
const CX = 300;
const CY = 190;
const POS: Record<NodeId, { x: number; y: number }> = {
  "ext-net": { x: 40, y: 150 },
  "traffic-gen": { x: 510, y: 150 },
  "pc-1": { x: 40, y: 20 },
  "pc-2": { x: 40, y: 280 },
  "pc-3": { x: 510, y: 20 },
  "pc-4": { x: 510, y: 280 },
  "pc-5": { x: 275, y: 345 },
};

const RANK: Record<TrafficPattern, number> = { routine: 1, surge: 2, blocked: 3, suspicious: 4 };

function spokeStyle(pattern: TrafficPattern | null): { className: string; dash?: string } {
  switch (pattern) {
    case "suspicious":
      return { className: "edge-danger edge-flow" };
    case "surge":
      return { className: "edge-validation edge-flow" };
    case "blocked":
      return { className: "edge-danger", dash: "2 6" };
    case "routine":
      return { className: "edge-data" };
    default:
      return { className: "edge-muted" };
  }
}

function buildGraph(flows: NetworkFlow[], statuses: Record<DeviceId, { status: DeviceStatus; ip?: string; role?: string }>, selected: DeviceId, ext: Record<ExtNodeId, DeviceRuntime> | null) {
  type Item = { id: NodeId; ip: string; role: string; status: DeviceStatus };
  const items: Item[] = [
    ...DEVICES.map<Item>((d) => ({ id: d.id, ip: statuses[d.id].ip ?? d.ip, role: statuses[d.id].role ?? d.role, status: statuses[d.id].status })),
    ...(ext ? EXT_NODE_IDS.map<Item>((id) => ({ id, ip: ext[id].ip ?? "not reported", role: ext[id].role ?? EXT_ROLE[id], status: ext[id].status })) : []),
  ];
  const nodes: Node[] = [
    { id: "bridge", type: "bridge", position: { x: CX - 65, y: CY - 30 }, data: {}, draggable: false, selectable: false, focusable: false },
    ...items.map<Node>((d) => ({
      id: d.id,
      type: "device",
      position: POS[d.id],
      draggable: false,
      data: { id: d.id, ip: d.ip, role: d.role, status: d.status, selected: d.id === selected } satisfies DeviceNodeData,
    })),
  ];

  const edges: Edge[] = items.map((d) => {
    const touching = flows.filter((f) => f.from === d.id || f.to === d.id);
    const top = touching.sort((a, b) => RANK[b.pattern] - RANK[a.pattern])[0];
    const { className, dash } = spokeStyle(top?.pattern ?? null);
    const sends = flows.some((f) => f.from === d.id);
    return {
      id: `spoke-${d.id}`,
      source: sends || !touching.length ? d.id : "bridge",
      target: sends || !touching.length ? "bridge" : d.id,
      type: "straight",
      className,
      style: dash ? { strokeDasharray: dash } : undefined,
      label: top && top.pattern !== "routine" ? `${top.pattern === "blocked" ? "blocked" : top.pps > 0 ? `${top.pps} pps` : top.pattern}` : undefined,
      selectable: false,
      focusable: false,
    } satisfies Edge;
  });
  return { nodes, edges };
}

const BOUNDS: Bounds = { x: 30, y: 10, width: 640, height: 430 };
const NODE_HALF_W = 75;
const NODE_HALF_H = 40;
const centerOf = (id: NodeId) => ({ x: POS[id].x + NODE_HALF_W, y: POS[id].y + NODE_HALF_H });

/**
 * Pre-calculated flight path: overview (implicit, t=0) -> attacker (0.3)
 * -> victim (0.6) -> core gateway `br-zephyr` (1.0). Attacker and victim
 * follow the newest live alert; before any alert they default to pc-5 -> pc-3.
 */
function buildStops(attacker: NodeId, victim: DeviceId): CameraStop[] {
  return [
    { t: 0.3, ...centerOf(attacker), zoom: 1.3, label: `Attacker · ${attacker}` },
    { t: 0.6, ...centerOf(victim), zoom: 1.3, label: `Victim · ${victim}` },
    { t: 1, x: CX, y: CY, zoom: 1.5, label: "Core gateway · br-zephyr" },
  ];
}

function Canvas() {
  const { state, dispatch } = useDemo();
  const { nodes, edges } = useMemo(
    () => buildGraph(state.flows, state.devices, state.selectedDeviceId, state.mode === "live" ? state.extNodes : null),
    [state.flows, state.devices, state.selectedDeviceId, state.extNodes, state.mode],
  );
  const live = [...state.cases].reverse().find((c) => c.isLive);
  const attacker = live?.alert.source_node ?? "pc-5";
  const victim = live?.alert.target_node ?? "pc-3";
  const stops = useMemo(() => buildStops(attacker, victim), [attacker, victim]);
  const ref = useRef<HTMLDivElement>(null);
  const { onInit, hud } = useScrollCamera({ containerRef: ref, stops, bounds: BOUNDS, listenForOverview: true });

  return (
    <div ref={ref} className="relative h-[340px] sm:h-[430px] w-full overflow-hidden rounded-lg border border-border bg-bg canvas-grid" role="group" aria-label={`Network topology: ${state.mode === "live" ? "7 nodes" : "5 containers"} connected to bridge br-zephyr. The camera tours the nodes automatically; click to pause or resume, scroll to steer.`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        {...LOCKED_CAMERA_PROPS}
        minZoom={0.1}
        maxZoom={3}
        elementsSelectable
        onInit={onInit}
        onNodeClick={(_, n) => n.type === "device" && DEVICE_IDS.includes(n.id as DeviceId) && dispatch({ type: "select_device", id: n.id as DeviceId })}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} size={1} />
      </ReactFlow>
      <CameraHud progress={hud.progress} label={hud.label} playing={hud.playing} />
      <ul className="pointer-events-none absolute bottom-2 right-2 hidden gap-3 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[10px] text-muted sm:flex">
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-accent" />routine</li>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-warning" />high volume</li>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-danger" />suspicious / blocked</li>
      </ul>
    </div>
  );
}

export function TopologyCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
