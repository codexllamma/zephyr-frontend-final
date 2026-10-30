import type { Metadata } from "next";
import { TrainingView } from "@/features/training/TrainingView";

export const metadata: Metadata = { title: "Training & Decisions · Zephyr" };

export default function TrainingPage() {
  return <TrainingView />;
}
