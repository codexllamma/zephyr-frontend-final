"use client";

import { useCallback } from "react";
import { useDemo } from "@/components/providers/DemoProvider";
import { services } from "@/lib/services";
import { appliedRules } from "@/lib/selectors";
import { AlertModal } from "@/features/alerts/AlertModal";
import { LiveTerminal } from "./LiveTerminal";
import { LiveAttackControls } from "./LiveAttackControls";
import { ScenarioControls } from "./ScenarioControls";
import { TerminalPanel } from "./TerminalPanel";
import { TopologyCanvas } from "./TopologyCanvas";

export function SimulationView() {
  const { state, dispatch } = useDemo();
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

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--nav-h))] min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
      <div className="flex shrink-0 items-center rounded-md border border-border bg-surface px-3 py-2">
        {state.mode === "live" ? <LiveAttackControls /> : <ScenarioControls />}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 h-full">
        <div className="flex h-full min-h-0 flex-1 flex-col">
          <TopologyCanvas />
        </div>
        <div className="flex h-full min-h-0 flex-1 flex-col">
          {state.mode === "live" ? (
            <LiveTerminal />
          ) : (
            <TerminalPanel
              key={deviceId}
              deviceId={deviceId}
              lines={state.terminals[deviceId]}
              onSubmit={runCommand}
              onClear={() => dispatch({ type: "terminal_clear", deviceId })}
            />
          )}
        </div>
      </div>

      <AlertModal />
    </div>
  );
}
