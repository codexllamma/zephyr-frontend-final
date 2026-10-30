import type { Metadata } from "next";
import { ArchitectureView } from "@/features/architecture/ArchitectureView";

export const metadata: Metadata = { title: "Architecture · Zephyr" };

export default function ArchitecturePage() {
  return <ArchitectureView />;
}
