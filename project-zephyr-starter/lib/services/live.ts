import { API_URL } from "@/lib/config";
import { mapNetworkStatus, pendingToCase } from "@/lib/live-map";
import { REVIEWER, DEVICES } from "@/data/devices";
import { SCENARIOS, SCENARIO_ORDER } from "@/data/scenarios";
import { BENCHMARK_SNAPSHOT } from "@/data/benchmarks";
import { runSimulatedCommand } from "@/lib/terminal";
import { selectDecisions, selectTrainingPairs } from "@/lib/selectors";
import type { AlertCase, DeviceId } from "@/types";
import type {
  BackendLogs,
  BackendSnapshot,
  ExecuteResponse,
  NlpAttackRequest,
  NlpAttackResponse,
  SlaHealth,
} from "@/types/backend";
import type { ZephyrServices } from "./types";

/* ------------------------------------------------------------------ */
/* Fetch wrapper                                                        */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

/** Reads wait up to 20 s; actions that run Docker commands (attack, execute, reset) up to 60 s. */
const READ_TIMEOUT_MS = 20_000;
const ACTION_TIMEOUT_MS = 60_000;

/**
 * Direct backend fetch to http://localhost:8000 without custom ngrok headers or env abstractions.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    const err = new DOMException("Request cancelled", "AbortError");
    throw err;
  }

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  const ctrl = new AbortController();
  const limit = (init.method ?? "GET").toUpperCase() === "GET" ? READ_TIMEOUT_MS : ACTION_TIMEOUT_MS;
  const timer = setTimeout(() => {
    try {
      ctrl.abort(new DOMException(`Backend did not answer within ${limit / 1000} s`, "TimeoutError"));
    } catch {
      try {
        ctrl.abort();
      } catch {}
    }
  }, limit);

  const onAbort = () => {
    try {
      ctrl.abort(signal?.reason ?? new DOMException("Request cancelled", "AbortError"));
    } catch {
      try {
        ctrl.abort();
      } catch {}
    }
  };

  if (signal) {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const res = await fetch(`${API_URL}${path}`, { ...init, headers, signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new ApiError(res.ok ? "Backend returned a non-JSON response" : `Backend error ${res.status}`, res.status);
    }
    if (!res.ok) {
      const detail = (body as { detail?: unknown } | null)?.detail;
      const msg = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : `Backend error ${res.status}`;
      throw new ApiError(msg, res.status);
    }
    return body as T;
  } catch (e: unknown) {
    if (e instanceof ApiError) throw e;

    const isAbort =
      signal?.aborted ||
      ctrl.signal.aborted ||
      (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) ||
      (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError");

    if (isAbort) {
      if (signal?.aborted) {
        throw new DOMException("Request cancelled", "AbortError");
      }
      throw new ApiError(`Backend did not answer within ${limit / 1000} s`, 408);
    }

    const message = e instanceof Error ? e.message : String(e);
    throw new ApiError(`Cannot reach ${API_URL}: ${message}`);
  } finally {
    clearTimeout(timer);
    if (signal) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Typed endpoints                                                      */
/* ------------------------------------------------------------------ */

export const liveApi = {
  /** Contract A. */
  getSnapshot: (signal?: AbortSignal) => apiFetch<BackendSnapshot>("/api/v1/pending_alerts", { method: "GET" }, signal),

  /** Contract B. `modifiedCmd` is sent only when the reviewer actually edited the command. */
  execute: (alertId: string, approved: boolean, modifiedCmd?: string) =>
    apiFetch<ExecuteResponse>(`/api/v1/execute/${encodeURIComponent(alertId)}`, {
      method: "POST",
      body: JSON.stringify(modifiedCmd ? { approved, modified_iptables_cmd: modifiedCmd } : { approved }),
    }),

  /** Phase 4 hybrid NLP router: runs a real attack in Docker and injects the alert + envelope. */
  simulateNlpAttack: (req: NlpAttackRequest) =>
    apiFetch<NlpAttackResponse>("/api/v1/simulate_nlp_attack", { method: "POST", body: JSON.stringify(req) }),

  /** Production SLA heartbeat (traffic-gen -> target). */
  getHealth: (targetNode: string, signal?: AbortSignal) =>
    apiFetch<SlaHealth>(`/api/v1/terminal/health?target_node=${encodeURIComponent(targetNode)}`, { method: "GET" }, signal),

  getCatalog: (signal?: AbortSignal) => apiFetch<unknown>("/api/v1/catalog", { method: "GET" }, signal),

  getLogs: (signal?: AbortSignal) => apiFetch<BackendLogs>("/api/v1/terminal/logs", { method: "GET" }, signal),

  /** Runs `iptables -L/-S INPUT` in the node; output is streamed into /terminal/logs. */
  getRules: (node: string) => apiFetch<unknown>(`/api/v1/terminal/rules?node=${encodeURIComponent(node)}`, { method: "GET" }),

  /** Flushes container firewall rules, kills attack processes, resets backend state. */
  resetEnvironment: () => apiFetch<unknown>("/api/v1/terminal/reset", { method: "POST", body: JSON.stringify({}) }),
};

/* ------------------------------------------------------------------ */
/* ZephyrServices implementation                                        */
/* ------------------------------------------------------------------ */

async function listCases(): Promise<AlertCase[]> {
  const snap = await liveApi.getSnapshot();
  const net = mapNetworkStatus(snap.network_status);
  const now = new Date().toISOString();
  return (snap.pending ?? []).map((p) => pendingToCase(p, net, now));
}

/**
 * Live provider. Alerts, review and execution hit the FastAPI backend.
 * Topology/scenario descriptions, the terminal and benchmarks have no backend
 * endpoint, so they reuse the static demo definitions and are not presented
 * as live data.
 */
export const liveServices: ZephyrServices = {
  mode: "backend",
  topology: { getDevices: async () => DEVICES },
  scenarios: { list: async () => SCENARIO_ORDER.map((id) => SCENARIOS[id]) },
  alerts: {
    list: listCases,
    get: async (id) => (await listCases()).find((c) => c.id === id) ?? null,
  },
  terminal: { run: async (deviceId: DeviceId, input, ctx) => runSimulatedCommand(deviceId, input, ctx) },
  mitigation: {
    propose: async () => {
      throw new ApiError("Proposals are generated by the backend model, not requested from the UI");
    },
  },
  critic: { validate: async () => [] },
  review: {
    submit: async (alertId, decision) => {
      if (decision !== "approve" && decision !== "reject") throw new ApiError(`The backend has no "${decision}" action`);
      await liveApi.execute(alertId, decision === "approve");
      return { status: decision === "approve" ? "approved" : "rejected", reviewer: REVIEWER };
    },
  },
  execution: {
    execute: async (alertId) => {
      const r = await liveApi.execute(alertId, true);
      return { status: "confirmed", simulated: false, message: `Backend status: ${r.status}`, appliedCommand: r.injected_cmd };
    },
  },
  training: { listPairs: async () => selectTrainingPairs(await listCases()) },
  decisions: { list: async () => selectDecisions(await listCases()) },
  evaluation: { getBenchmarkSnapshot: async () => BENCHMARK_SNAPSHOT },
};
