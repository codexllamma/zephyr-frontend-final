import type { DeviceId, DeviceRuntime, NetworkDevice, NetworkFlow } from "@/types";

/**
 * DEMO DATA — illustrative values for the five-container `br-zephyr` lab.
 * Replace with the real topology from the backend when it is connected.
 */

export const REVIEWER = "Admin3";
export const MODEL_VERSION = "zephyr-dpo-v3";
export const BRIDGE_NAME = "br-zephyr";
export const BRIDGE_SUBNET = "172.28.0.0/16";
export const BRIDGE_GATEWAY = "172.28.0.1";

/** Simulated-clock origin. Deterministic so the demo narrative is repeatable. */
export const SIM_EPOCH_MS = Date.UTC(2026, 9, 28, 10, 30, 0);

export const DEVICES: NetworkDevice[] = [
  {
    id: "pc-1",
    name: "pc-1",
    ip: "172.28.0.11",
    role: "Directory & file share",
    services: ["Kerberos :88", "SMB :445"],
  },
  {
    id: "pc-2",
    name: "pc-2",
    ip: "172.28.0.12",
    role: "MySQL database",
    services: ["MySQL :3306", "SSH :22"],
  },
  {
    id: "pc-3",
    name: "pc-3",
    ip: "172.28.0.13",
    role: "Storefront web portal",
    services: ["HTTP :80", "HTTPS :443", "API :8080"],
  },
  {
    id: "pc-4",
    name: "pc-4",
    ip: "172.28.0.14",
    role: "SSH / FTP host",
    services: ["SSH :22", "FTP :21"],
  },
  {
    id: "pc-5",
    name: "pc-5",
    ip: "172.28.0.15",
    role: "Workstation & API client pool",
    services: ["Client apps"],
  },
];

export const DEVICE_BY_ID = Object.fromEntries(DEVICES.map((d) => [d.id, d])) as Record<
  DeviceId,
  NetworkDevice
>;

export const NODE_IP = Object.fromEntries(DEVICES.map((d) => [d.id, d.ip])) as Record<
  DeviceId,
  string
>;

export const IP_TO_NODE = Object.fromEntries(DEVICES.map((d) => [d.ip, d.id])) as Record<
  string,
  DeviceId
>;

export function initialDeviceRuntime(): Record<DeviceId, DeviceRuntime> {
  return {
    "pc-1": { status: "healthy" },
    "pc-2": { status: "healthy" },
    "pc-3": { status: "healthy" },
    "pc-4": { status: "healthy" },
    "pc-5": { status: "healthy" },
  };
}

/** Baseline routine traffic that is visible before any scenario runs. */
export const BASELINE_FLOWS: NetworkFlow[] = [
  { id: "flow-base-web", from: "pc-5", to: "pc-3", port: 80, protocol: "HTTP", pps: 140, pattern: "routine" },
  { id: "flow-base-db", from: "pc-3", to: "pc-2", port: 3306, protocol: "TCP", pps: 95, pattern: "routine" },
  { id: "flow-base-auth", from: "pc-4", to: "pc-1", port: 88, protocol: "TCP", pps: 22, pattern: "routine" },
  { id: "flow-base-smb", from: "pc-5", to: "pc-1", port: 445, protocol: "TCP", pps: 48, pattern: "routine" },
];

/** Plain-English name for well-known ports, used in generated summaries. */
export function serviceName(port: number): string {
  switch (port) {
    case 21:
      return "FTP service";
    case 22:
      return "SSH service";
    case 80:
      return "web storefront (HTTP)";
    case 443:
      return "web storefront (HTTPS)";
    case 8080:
      return "storefront API";
    case 3306:
      return "MySQL database";
    case 445:
      return "SMB file share";
    case 88:
      return "Kerberos service";
    default:
      return `service on port ${port}`;
  }
}
