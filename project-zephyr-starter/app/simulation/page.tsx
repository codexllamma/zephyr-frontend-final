import type { Metadata } from "next";
import { SimulationView } from "@/features/simulation/SimulationView";

export const metadata: Metadata = { title: "Simulation · Zephyr" };

export default function SimulationPage() {
  return <SimulationView />;
}
