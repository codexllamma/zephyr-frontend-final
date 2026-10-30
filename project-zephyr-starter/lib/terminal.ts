import { BRIDGE_GATEWAY, BRIDGE_SUBNET, DEVICES, DEVICE_BY_ID } from "@/data/devices";
import { parseIptables } from "@/lib/critic";
import { fakeUuid } from "@/lib/format";
import type { DeviceId, TerminalLineKind } from "@/types";

/**
 * SAFE SIMULATED TERMINAL ENGINE.
 *
 * This is a lookup table of predefined commands with deterministic responses.
 * It never executes user input, never touches a shell, and never talks to
 * Docker. Anything outside the predefined list answers "command not found".
 */

export interface TerminalContext {
  /** Rules applied by (simulated) executions inside this device's namespace. */
  appliedRules: { alertId: string; command: string }[];
  /** Current simulated-clock time (ISO-8601). */
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
const sys = (text: string): TerminalOutputLine => ({ kind: "system", text });

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} UTC ${d.getUTCFullYear()}`;
}

export function terminalBanner(deviceId: DeviceId): TerminalOutputLine[] {
  return [
    sys(`[simulated] Safe demo terminal for ${deviceId}. Commands are predefined; nothing runs in a real container.`),
    sys("Type `help` to see what is available."),
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
          out(`Simulated terminal for ${deviceId} — predefined commands only:`),
          out("  help                   show this list"),
          out("  clear                  clear the screen"),
          out("  whoami                 current user"),
          out("  hostname               container name"),
          out("  pwd                    working directory"),
          out("  ls                     list the root directory"),
          out("  ip addr                interface addresses"),
          out("  ip route               routing table"),
          out("  iptables -L INPUT -n   INPUT rules, incl. simulated Zephyr actions"),
          out("  docker ps              illustrative host-level container list"),
          out("  date                   simulated demo clock"),
          sys("Nothing here executes in a real container."),
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
          out("1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN"),
          out("    inet 127.0.0.1/8 scope host lo"),
          out("2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP"),
          out(`    link/ether ${mac} brd ff:ff:ff:ff:ff:ff`),
          out(`    inet ${device.ip}/16 brd 172.28.255.255 scope global eth0`),
          sys("[simulated] illustrative demo address"),
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
          sys(
            rules.length
              ? "[simulated] rules above were applied by Zephyr actions executed in this demo"
              : "[simulated] no Zephyr actions have been executed on this container in this demo",
          ),
        ],
      };
    }
    case "docker ps":
      return {
        lines: [
          sys("[illustrative host-level output — this demo has no Docker access]"),
          out("CONTAINER ID   IMAGE              STATUS                  NAMES"),
          ...DEVICES.map((d) =>
            out(`${fakeUuid(`container-${d.id}`).replace(/-/g, "").slice(0, 12)}   zephyr/node:demo   Up 3 hours (simulated)   ${d.name}`),
          ),
        ],
      };
    case "date":
      return { lines: [out(fmtDate(ctx.nowIso)), sys("[simulated] demo clock")] };
    default: {
      const name = input.split(" ")[0];
      return {
        lines: [
          { kind: "error", text: `bash: ${name}: command not found` },
          sys("Simulated terminal: only predefined commands are available. Type `help`."),
        ],
      };
    }
  }
}
