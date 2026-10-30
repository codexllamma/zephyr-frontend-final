"use client";

import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import Link from "next/link";
import { useDemo } from "@/components/providers/DemoProvider";
import { Panel, EmptyState } from "@/components/ui/Panel";
import { EventTimeline } from "@/components/ui/EventTimeline";
import { Badge } from "@/components/ui/Badge";
import { services } from "@/lib/services";
import { appliedRules, sortedByNewest } from "@/lib/selectors";
import { AlertSummaryRow } from "@/features/alerts/AlertSummaryRow";
import { DeviceInspector } from "./DeviceInspector";
import { LiveTerminal } from "./LiveTerminal";
import { SlaHeartbeat } from "./SlaHeartbeat";
import { LiveAttackControls } from "./LiveAttackControls";
import { ScenarioControls } from "./ScenarioControls";
import { TerminalPanel } from "./TerminalPanel";
import { TopologyCanvas } from "./TopologyCanvas";

const MIN_W = 320;
const MAX_W = 640;

export function SimulationView() {
  const { state, dispatch } = useDemo();
  const [width, setWidth] = useState(400);
  const [termCollapsed, setTermCollapsed] = useState(false);
  const drag = useRef<{ x: number; w: number } | null>(null);

  const deviceId = state.selectedDeviceId;

  const runCommand = useCallback(
    async (input: string) => {
      const res = await services.terminal.run(deviceId, input, {
        appliedRules: appliedRules(state.cases, deviceId),
        nowIso: new Date(state.clockMs).toISOString(),
      });
      if (res.clear) dispatch({ type: "terminal_clear", deviceId });
      else dispatch({ type: "terminal_result", deviceId, command: input, lines: res.lines });
    },
    [deviceId, state.cases, state.clockMs, dispatch],
  );

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setWidth(Math.min(MAX_W, Math.max(MIN_W, drag.current.w - (e.clientX - drag.current.x))));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") setWidth((w) => Math.min(MAX_W, w + 24));
    if (e.key === "ArrowRight") setWidth((w) => Math.max(MIN_W, w - 24));
  };

  const healthy = Object.values(state.devices).filter((d) => d.status === "healthy").length;
  const recent = sortedByNewest(state.cases);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-fg-strong">Network Simulation</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone={healthy === 5 ? "success" : "warning"}>{healthy}/5 containers healthy</Badge>
          {state.mode === "live" ? (
            <Badge tone={state.backend.link === "online" ? "success" : state.backend.link === "error" ? "danger" : "warning"}>
              Backend {state.backend.link}
            </Badge>
          ) : (
            <Badge tone="warning">Simulated environment</Badge>
          )}
          <span>
            {state.mode === "live" ? "Last sync" : "Demo clock"}{" "}
            <span className="font-mono text-fg">
              {state.mode === "live" && !state.backend.lastSyncAt ? "—" : `${new Date(state.clockMs).toISOString().slice(11, 19)} UTC`}
            </span>
          </span>
        </div>
      </div>

      <Panel>
        {state.mode === "live" ? <LiveAttackControls /> : <ScenarioControls />}
      </Panel>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <TopologyCanvas />
          {state.mode === "live" && <SlaHeartbeat />}
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel id="event-timeline" title="Event timeline" bodyClassName="max-h-72 overflow-auto p-3.5">
              <EventTimeline events={state.events.slice(-14)} newestFirst />
            </Panel>
            <Panel
              title="Blue Team HITL Queue (Approval Cards)"
              actions={<Link href="/alerts" className="text-xs text-accent hover:underline">Open Alerts &amp; Review</Link>}
              bodyClassName="max-h-96 overflow-auto"
            >
              {recent.length === 0 ? (
                <EmptyState title="No pending alerts in queue" hint={state.mode === "live" ? "Launch a threat above to generate a live NIDS alert and mitigation envelope." : "Run the Suspicious Traffic or Flash-Sale scenario to generate one."} />
              ) : (
                recent.map((c) => (
                  <AlertSummaryRow
                    key={c.id}
                    c={c}
                    selected={c.id === state.selectedAlertId}
                    onSelect={(id) => dispatch({ type: "select_alert", id })}
                  />
                ))
              )}
            </Panel>
          </div>
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize side panel"
          aria-valuemin={MIN_W}
          aria-valuemax={MAX_W}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => (drag.current = null)}
          onKeyDown={onKey}
          className="hidden w-1.5 shrink-0 cursor-col-resize rounded bg-border hover:bg-accent focus-visible:bg-accent lg:block"
        />

        <aside style={{ ["--side-w" as string]: `${width}px` }} className="flex min-w-0 flex-col gap-3 lg:w-[var(--side-w)] lg:shrink-0">
          <DeviceInspector />
          {state.mode === "live" ? (
            <LiveTerminal collapsed={termCollapsed} onToggle={() => setTermCollapsed((c) => !c)} />
          ) : (
            <TerminalPanel
            key={deviceId}
            deviceId={deviceId}
            lines={state.terminals[deviceId]}
            onSubmit={runCommand}
            onClear={() => dispatch({ type: "terminal_clear", deviceId })}
            collapsed={termCollapsed}
            onToggle={() => setTermCollapsed((c) => !c)}
          />
          )}
        </aside>
      </div>
    </div>
  );
}
