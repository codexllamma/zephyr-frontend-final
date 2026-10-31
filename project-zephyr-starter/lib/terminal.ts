import { BRIDGE_GATEWAY, BRIDGE_SUBNET, DEVICES, DEVICE_BY_ID } from "@/data/devices";
import { parseIptables } from "@/lib/critic";
import { fakeUuid } from "@/lib/format";
import type { DeviceId, TerminalLineKind } from "@/types";

export interface TerminalContext {
  appliedRules: { alertId: string; command: string }[];
  nowIso: string;
}

export interface TerminalOutputLine {
  kind: TerminalLineKind;
  text: string;
}

export interface TerminalResult {
  clear?: boolean;
  lines: TerminalOutputLine[];
}

export const SUPPORTED_COMMANDS = [
  "help",
  "clear",
  "whoami",
  "hostname",
  "pwd",
  "ls",
  "ip addr",
  "ip route",
  "iptables -L INPUT -n",
  "docker ps",
  "date",
] as const;

const out = (text: string): TerminalOutputLine => ({ kind: "output", text });

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} UTC ${d.getUTCFullYear()}`;
}

export function terminalBanner(deviceId: DeviceId): TerminalOutputLine[] {
  const device = DEVICE_BY_ID[deviceId];
  return [
    { kind: "log", text: `[ACCEPT] 172.28.0.101 -> ${device.ip}:80 PROTO=TCP` },
  ];
}

function iptablesLine(command: string): string | null {
  const p = parseIptables(command);
  if (!p.ok || !p.target) return null;
  const pad = (s: string, n: number) => s.padEnd(n, " ");
  const src = p.source ?? "0.0.0.0/0";
  const proto = p.proto ?? "all";
  let extra = "";
  if (p.dport !== undefined) extra += ` ${proto} dpt:${p.dport}`;
  if (command.includes("--syn")) extra += " flags:0x17/0x02";
  const limit = /--limit (\S+)/.exec(command);
  const burst = /--limit-burst (\S+)/.exec(command);
  if (limit) extra += ` limit: avg ${limit[1].replace("/second", "/sec")}${burst ? ` burst ${burst[1]}` : ""}`;
  return `${pad(p.target, 11)}${pad(proto, 5)}${pad("--", 5)}${pad(src, 21)}${pad("0.0.0.0/0", 21)}${extra.trim()}`;
}

export function runSimulatedCommand(deviceId: DeviceId, raw: string, ctx: TerminalContext): TerminalResult {
  const input = raw.trim().replace(/\s+/g, " ");
  if (!input) return { lines: [] };
  const device = DEVICE_BY_ID[deviceId];

  switch (input) {
    case "clear":
      return { clear: true, lines: [] };
    case "help":
      return {
        lines: [
          out("help | clear | whoami | hostname | pwd | ls | ip addr | ip route | iptables -L INPUT -n | docker ps | date"),
        ],
      };
    case "whoami":
      return { lines: [out("root")] };
    case "hostname":
      return { lines: [out(deviceId)] };
    case "pwd":
      return { lines: [out("/")] };
    case "ls":
    case "ls /":
      return { lines: [out("bin  boot  dev  etc  home  lib  opt  proc  root  run  srv  sys  tmp  usr  var")] };
    case "ip addr":
    case "ip a": {
      const last = Number(device.ip.split(".")[3]);
      const mac = `02:42:ac:1c:00:${last.toString(16).padStart(2, "0")}`;
      return {
        lines: [
          out("1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN"),
          out("    inet 127.0.0.1/8 scope host lo"),
          out("2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP"),
          out(`    link/ether ${mac} brd ff:ff:ff:ff:ff:ff`),
          out(`    inet ${device.ip}/16 brd 172.28.255.255 scope global eth0`),
        ],
      };
    }
    case "ip route":
    case "ip r":
      return {
        lines: [
          out(`default via ${BRIDGE_GATEWAY} dev eth0`),
          out(`${BRIDGE_SUBNET} dev eth0 proto kernel scope link src ${device.ip}`),
        ],
      };
    case "iptables -L INPUT -n":
    case "iptables -L INPUT":
    case "iptables -L": {
      const rules = ctx.appliedRules.map((r) => iptablesLine(r.command)).filter((l): l is string => l !== null);
      return {
        lines: [
          out("Chain INPUT (policy ACCEPT)"),
          out("target     prot opt source               destination"),
          ...rules.map(out),
        ],
      };
    }
    case "docker ps":
      return {
        lines: [
          out("CONTAINER ID   IMAGE              STATUS       NAMES"),
          ...DEVICES.map((d) =>
            out(`${fakeUuid(`container-${d.id}`).replace(/-/g, "").slice(0, 12)}   zephyr/node:demo   Up 3 hours   ${d.name}`),
          ),
        ],
      };
    case "date":
      return { lines: [out(fmtDate(ctx.nowIso))] };
    default: {
      const name = input.split(" ")[0];
      return {
        lines: [{ kind: "error", text: `bash: ${name}: command not found` }],
      };
    }
  }
}
