import { Activity, ClipboardCheck, GitBranch, Network, type LucideIcon } from "lucide-react";

export interface TabDef {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const TABS: TabDef[] = [
  { href: "/simulation", label: "Simulation", icon: Network },
  { href: "/alerts", label: "Alerts & Review", icon: ClipboardCheck },
  { href: "/training", label: "Training & Decisions", icon: Activity },
  { href: "/architecture", label: "Architecture", icon: GitBranch },
];
