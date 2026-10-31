"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { CAMERA_OVERVIEW_EVENT, LOCKED_CAMERA_PROPS, useScrollCamera } from "@/hooks/useScrollCamera";
import type { Bounds, CameraStop } from "@/lib/camera";
import {
  Activity,
  Cloud,
  Database,
  FolderLock,
  Globe,
  Monitor,
  Network,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { useDemo } from "@/components/providers/DemoProvider";
import { DEVICE_STATUS_META, StatusDot } from "@/components/ui/StatusDot";
import { DEVICES } from "@/data/devices";
import { cn } from "@/lib/cn";
import {
  DEVICE_IDS,
  EXT_NODE_IDS,
  type DeviceId,
  type DeviceRuntime,
  type DeviceStatus,
  type DramaState,
  type ExtNodeId,
  type NetworkFlow,
  type NodeId,
  type TrafficPattern,
} from "@/types";

const ICONS: Record<NodeId, LucideIcon> = {
  "pc-1": FolderLock,
  "pc-2": Database,
  "pc-3": Globe,
  "pc-4": Terminal,
  "pc-5": Monitor,
  "ext-net": Cloud,
  "traffic-gen": Activity,
};
const EXT_ROLE: Record<ExtNodeId, string> = {
  "ext-net": "External attacker network",
  "traffic-gen": "Legitimate traffic generator",
};

interface DeviceNodeData extends Record<string, unknown> {
  id: NodeId;
  ip: string;
  role: string;
  status: DeviceStatus;
  selected: boolean;
  shieldActive: boolean;
  underAttackFocus: boolean;
}

interface BridgeNodeData extends Record<string, unknown> {
  underAttack: boolean;
  mitigated: boolean;
}

const hidden = { left: "50%", top: "50%", opacity: 0, pointerEvents: "none" as const };

function DeviceNode({ data }: NodeProps<Node<DeviceNodeData>>) {
  const [hovered, setHovered] = useState(false);
  const Icon = ICONS[data.id];
  const meta = DEVICE_STATUS_META[data.status];
  const ring = data.underAttackFocus
    ? "border-red-600 bg-zinc-950"
    : data.status === "healthy" || data.status === "unknown"
      ? "border-zinc-800"
      : data.status === "under_review" || data.status === "blocked"
        ? "border-amber-700"
        : data.status === "mitigated"
          ? "border-emerald-700"
          : "border-red-600";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "group relative w-[150px] rounded-md border bg-zinc-950 px-3 py-2.5 text-left transition-colors duration-300",
        ring,
        data.shieldActive && "anim-node-shield",
        data.selected && "outline outline-2 outline-offset-2 outline-zinc-500",
      )}
    >
      <div
        role="tooltip"
        className={cn(
          "pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 font-mono text-xs text-zinc-100",
          hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        {data.ip}
      </div>
      <Handle type="target" position={Position.Top} style={hidden} isConnectable={false} />
      <Handle type="source" position={Position.Top} style={hidden} isConnectable={false} />
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-md bg-zinc-900 text-zinc-400">
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[13px] font-semibold text-zinc-100">{data.id}</p>
          <p className="truncate font-mono text-[10px] text-zinc-500">{data.ip}</p>
        </div>
      </div>
      <p className={cn("mt-2 flex items-center gap-1.5 text-[11px] font-medium", meta.text)}>
        <StatusDot tone={meta.dot} /> {meta.label}
      </p>
    </div>
  );
}

function BridgeNode({ data }: NodeProps<Node<BridgeNodeData>>) {
  return (
    <div
      className={cn(
        "w-[130px] rounded-full border bg-zinc-950 px-3 py-2.5 text-center transition-colors duration-300",
        data.underAttack
          ? "border-red-600"
          : data.mitigated
            ? "border-emerald-700"
            : "border-zinc-700",
      )}
    >
      <Handle type="target" position={Position.Top} style={hidden} isConnectable={false} />
      <Handle type="source" position={Position.Top} style={hidden} isConnectable={false} />
      <Network
        aria-hidden
        className={cn(
          "mx-auto size-4",
          data.underAttack
            ? "text-red-500"
            : data.mitigated
              ? "text-emerald-500"
              : "text-zinc-400",
        )}
      />
      <p className="font-mono text-[12px] font-semibold text-zinc-100">br-zephyr</p>
    </div>
  );
}

const nodeTypes: NodeTypes = { device: DeviceNode, bridge: BridgeNode };

interface PacketEdgeData extends Record<string, unknown> {
  isAttackLeg?: boolean;
  isMitigatedSlaLeg?: boolean;
  className?: string;
  dash?: string;
}

function PacketSpokeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  label,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const isAttack = Boolean(data?.isAttackLeg);
  const isSla = Boolean(data?.isMitigatedSlaLeg);
  const edgeClassName =
    (data?.className as string | undefined) ||
    (isAttack ? "edge-attack-throb" : isSla ? "edge-calm-green" : "edge-muted");

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} className={edgeClassName} />

      {/* Animated small rectangular packet nodes traveling across paths */}
      {isAttack && (
        <g>
          <rect width="9" height="5" rx="1" fill="#ef4444" className="shadow-xs">
            <animateMotion dur="0.8s" repeatCount="indefinite" path={edgePath} rotate="auto" />
          </rect>
          <rect width="9" height="5" rx="1" fill="#dc2626" opacity="0.85">
            <animateMotion dur="0.8s" begin="0.4s" repeatCount="indefinite" path={edgePath} rotate="auto" />
          </rect>
        </g>
      )}

      {isSla && (
        <g>
          <rect width="8" height="4" rx="1" fill="#22c55e" opacity="0.95">
            <animateMotion dur="1.2s" repeatCount="indefinite" path={edgePath} rotate="auto" />
          </rect>
        </g>
      )}

      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "none",
            }}
            className="rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 shadow-xs"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes: EdgeTypes = {
  packetEdge: PacketSpokeEdge,
};

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
      return { className: "edge-attack-throb" };
    case "surge":
      return { className: "edge-validation edge-flow" };
    case "blocked":
      return { className: "edge-muted", dash: "2 6" };
    case "routine":
      return { className: "edge-calm-green" };
    default:
      return { className: "edge-muted" };
  }
}

function buildGraph(
  flows: NetworkFlow[],
  statuses: Record<DeviceId, { status: DeviceStatus; ip?: string; role?: string }>,
  selected: DeviceId,
  ext: Record<ExtNodeId, DeviceRuntime> | null,
  drama: DramaState,
  shieldActive: boolean,
) {
  type Item = { id: NodeId; ip: string; role: string; status: DeviceStatus };
  const FALLBACK_EXT_IPS: Record<ExtNodeId, string> = {
    "ext-net": "172.28.0.100",
    "traffic-gen": "172.28.0.101",
  };
  const items: Item[] = [
    ...DEVICES.map<Item>((d) => ({
      id: d.id,
      ip: statuses[d.id].ip ?? d.ip,
      role: statuses[d.id].role ?? d.role,
      status: statuses[d.id].status,
    })),
    ...(ext
      ? EXT_NODE_IDS.map<Item>((id) => ({
          id,
          ip: ext[id].ip ?? FALLBACK_EXT_IPS[id],
          role: ext[id].role ?? EXT_ROLE[id],
          status: ext[id].status,
        }))
      : []),
  ];

  const isAttackActive = drama.phase === "thinking" || drama.phase === "awaiting_decision";
  const isMitigated = drama.phase === "mitigated";

  const nodes: Node[] = [
    {
      id: "bridge",
      type: "bridge",
      position: { x: CX - 65, y: CY - 30 },
      data: { underAttack: isAttackActive, mitigated: isMitigated } satisfies BridgeNodeData,
      draggable: false,
      selectable: false,
      focusable: false,
    },
    ...items.map<Node>((d) => {
      const isAttackerOrVictim =
        isAttackActive && (d.id === drama.sourceNode || d.id === drama.targetNode);
      return {
        id: d.id,
        type: "device",
        position: POS[d.id],
        draggable: false,
        data: {
          id: d.id,
          ip: d.ip,
          role: d.role,
          status: d.status,
          selected: d.id === selected,
          shieldActive,
          underAttackFocus: isAttackerOrVictim,
        } satisfies DeviceNodeData,
      };
    }),
  ];

  const edges: Edge[] = items.map((d) => {
    const touching = flows.filter((f) => f.from === d.id || f.to === d.id);
    const top = touching.sort((a, b) => RANK[b.pattern] - RANK[a.pattern])[0];

    const isAttackLeg =
      isAttackActive && (d.id === drama.sourceNode || d.id === drama.targetNode);
    const isMitigatedSlaLeg =
      isMitigated && (d.id === "traffic-gen" || d.id === drama.targetNode);
    const isMitigatedBlockedLeg =
      isMitigated && d.id === drama.sourceNode && d.id !== "traffic-gen" && d.id !== drama.targetNode;

    let className: string;
    let dash: string | undefined;
    if (isAttackLeg) {
      className = "edge-attack-throb";
    } else if (isMitigated) {
      if (isMitigatedSlaLeg) {
        className = "edge-calm-green";
      } else if (isMitigatedBlockedLeg) {
        className = "edge-muted";
        dash = "4 5";
      } else {
        className = "edge-muted";
      }
    } else {
      const st = spokeStyle(top?.pattern ?? null);
      className = st.className;
      dash = st.dash;
    }

    const label = isAttackLeg
      ? d.id === drama.sourceNode
        ? "FLOOD 14.5k pps"
        : `TARGET :${drama.targetPort}`
      : isMitigatedSlaLeg && d.id === "traffic-gen"
        ? "HTTP 200 OK"
        : isMitigatedBlockedLeg
          ? "BLOCKED"
          : top && top.pattern !== "routine" && !isMitigated
            ? `${top.pattern === "blocked" ? "blocked" : top.pps > 0 ? `${top.pps} pps` : top.pattern}`
            : undefined;

    const isTarget = d.id === drama.targetNode;

    return {
      id: `spoke-${d.id}`,
      source: isTarget ? "bridge" : d.id,
      target: isTarget ? d.id : "bridge",
      type: "packetEdge",
      className,
      style: dash ? { strokeDasharray: dash } : undefined,
      label,
      data: {
        isAttackLeg,
        isMitigatedSlaLeg,
        className,
        dash,
      },
      selectable: false,
      focusable: false,
    } satisfies Edge;
  });

  return { nodes, edges };
}

const BOUNDS: Bounds = { x: 30, y: 10, width: 640, height: 430 };
const NODE_HALF_W = 75;
const NODE_HALF_H = 40;
const centerOf = (id: NodeId) => {
  const pos = POS[id] ?? { x: CX - NODE_HALF_W, y: CY - NODE_HALF_H };
  return { x: pos.x + NODE_HALF_W, y: pos.y + NODE_HALF_H };
};

function buildStops(attacker: NodeId, victim: DeviceId): CameraStop[] {
  return [
    { t: 0.3, ...centerOf(attacker), zoom: 1.3, label: `Attacker · ${attacker}` },
    { t: 0.6, ...centerOf(victim), zoom: 1.3, label: `Victim · ${victim}` },
    { t: 1, x: CX, y: CY, zoom: 1.5, label: "Core gateway · br-zephyr" },
  ];
}

function Canvas() {
  const { state, dispatch } = useDemo();
  const [dismissedShakeEpoch, setDismissedShakeEpoch] = useState(0);
  const [dismissedShieldEpoch, setDismissedShieldEpoch] = useState(0);

  const attackEpoch = state.drama.attackEpoch;
  const mitigationEpoch = state.drama.mitigationEpoch;
  const shaking = attackEpoch > 0 && dismissedShakeEpoch !== attackEpoch;
  const shieldFlash = mitigationEpoch > 0 && dismissedShieldEpoch !== mitigationEpoch;

  // Clear subtle CSS screen-shake class after animation finishes & keep full topology framed
  useEffect(() => {
    if (attackEpoch === 0) return;
    window.dispatchEvent(new Event(CAMERA_OVERVIEW_EVENT));
    const t = window.setTimeout(() => setDismissedShakeEpoch(attackEpoch), 560);
    return () => window.clearTimeout(t);
  }, [attackEpoch]);

  // Clear temporary green shield overlay & ripple after animation finishes & keep full topology framed
  useEffect(() => {
    if (mitigationEpoch === 0) return;
    window.dispatchEvent(new Event(CAMERA_OVERVIEW_EVENT));
    const t = window.setTimeout(() => setDismissedShieldEpoch(mitigationEpoch), 1150);
    return () => window.clearTimeout(t);
  }, [mitigationEpoch]);

  const isUnderAttack =
    state.drama.phase === "thinking" ||
    state.drama.phase === "awaiting_decision" ||
    state.cases.some((c) => c.stage === "awaiting_review");

  const { nodes, edges } = useMemo(
    () =>
      buildGraph(
        state.flows,
        state.devices,
        state.selectedDeviceId,
        state.mode === "live" ? state.extNodes : state.extNodes,
        state.drama,
        shieldFlash,
      ),
    [
      state.flows,
      state.devices,
      state.selectedDeviceId,
      state.extNodes,
      state.mode,
      state.drama,
      shieldFlash,
    ],
  );

  const live = [...state.cases].reverse().find((c) => c.isLive);
  const attacker =
    state.drama.phase !== "idle"
      ? state.drama.sourceNode
      : (live?.alert.source_node ?? "ext-net");
  const victim =
    state.drama.phase !== "idle"
      ? state.drama.targetNode
      : (live?.alert.target_node ?? "pc-4");
  const stops = useMemo(() => buildStops(attacker, victim), [attacker, victim]);
  const ref = useRef<HTMLDivElement>(null);
  const { onInit } = useScrollCamera({
    containerRef: ref,
    stops,
    bounds: BOUNDS,
    listenForOverview: true,
  });

  return (
    <div
      ref={ref}
      className={cn(
        "relative h-full min-h-0 w-full flex-1 overflow-hidden rounded-md border bg-zinc-950 canvas-grid transition-colors duration-300",
        isUnderAttack ? "anim-stress-border border-red-800" : "border-zinc-800",
        shaking && "anim-screen-shake",
      )}
      role="group"
      aria-label="Network topology"
    >
      <ReactFlow
        className="h-full w-full"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        {...LOCKED_CAMERA_PROPS}
        minZoom={0.1}
        maxZoom={3}
        elementsSelectable
        onInit={onInit}
        onNodeClick={(_, n) =>
          n.type === "device" &&
          DEVICE_IDS.includes(n.id as DeviceId) &&
          dispatch({ type: "select_device", id: n.id as DeviceId })
        }
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} size={1} />
      </ReactFlow>

      {shieldFlash && (
        <div
          key={`shield-overlay-${state.drama.mitigationEpoch}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
        >
          <div className="anim-shield-flash absolute inset-0 bg-emerald-600/15" />
          <div className="anim-shield-ripple absolute left-1/2 top-1/2 size-56 rounded-full border border-emerald-500/70 bg-emerald-500/5" />
        </div>
      )}
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
