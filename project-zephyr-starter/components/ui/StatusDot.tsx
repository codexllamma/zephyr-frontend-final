import { cn } from "@/lib/cn";
import type { DeviceStatus } from "@/types";

export const DEVICE_STATUS_META: Record<DeviceStatus, { label: string; dot: string; text: string }> = {
  healthy: { label: "Healthy", dot: "bg-success", text: "text-success" },
  suspicious: { label: "Suspicious", dot: "bg-danger", text: "text-danger" },
  under_review: { label: "Under review", dot: "bg-warning", text: "text-warning" },
  isolated: { label: "Isolated", dot: "bg-danger", text: "text-danger" },
  attacking: { label: "Attacking", dot: "bg-danger", text: "text-danger" },
  under_attack: { label: "Under attack", dot: "bg-danger", text: "text-danger" },
  mitigated: { label: "Mitigated", dot: "bg-success", text: "text-success" },
  blocked: { label: "Blocked", dot: "bg-warning", text: "text-warning" },
  unknown: { label: "Unknown", dot: "bg-subtle", text: "text-muted" },
};

export function StatusDot({ className, tone }: { className?: string; tone: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", tone, className)} />;
}
