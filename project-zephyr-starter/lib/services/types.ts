import type { TerminalContext, TerminalResult } from "@/lib/terminal";
import type {
  AlertCase,
  BenchmarkSnapshot,
  CriticCheck,
  DecisionRecord,
  DeviceId,
  ExecutionResult,
  MitigationEnvelope,
  NIDSAlert,
  NetworkDevice,
  ReviewDecision,
  ReviewState,
  ScenarioDefinition,
  TrainingPair,
} from "@/types";

/**
 * Data-access contract between the UI and the Zephyr backend.
 *
 * Every method is asynchronous so a real HTTP/WebSocket implementation can be
 * dropped in later. In this frontend-only build the demo provider
 * (`./demo.ts`) answers from local fixtures and says so (`mode: "demo"`).
 */
export interface ZephyrServices {
  /** "demo" = fixtures and simulation; "backend" = live Zephyr APIs. */
  mode: "demo" | "backend";

  topology: {
    getDevices(): Promise<NetworkDevice[]>;
  };
  scenarios: {
    list(): Promise<ScenarioDefinition[]>;
  };
  alerts: {
    list(): Promise<AlertCase[]>;
    get(alertId: string): Promise<AlertCase | null>;
  };
  terminal: {
    /** Run one command in a device's terminal. */
    run(deviceId: DeviceId, input: string, ctx: TerminalContext): Promise<TerminalResult>;
  };
  mitigation: {
    /** Ask the model for a MitigationEnvelope for an alert. */
    propose(alert: NIDSAlert): Promise<MitigationEnvelope>;
  };
  critic: {
    validate(envelope: MitigationEnvelope, alert: NIDSAlert): Promise<CriticCheck[]>;
  };
  review: {
    submit(alertId: string, decision: ReviewDecision, note?: string): Promise<ReviewState>;
  };
  execution: {
    execute(alertId: string): Promise<ExecutionResult>;
  };
  training: {
    listPairs(): Promise<TrainingPair[]>;
  };
  decisions: {
    list(): Promise<DecisionRecord[]>;
  };
  evaluation: {
    getBenchmarkSnapshot(): Promise<BenchmarkSnapshot>;
  };
}

export interface ConnectionStatus {
  mode: "demo" | "backend";
  label: string;
  detail: string;
  /** True when NEXT_PUBLIC_API_URL is set. */
  backendConfigured: boolean;
}
