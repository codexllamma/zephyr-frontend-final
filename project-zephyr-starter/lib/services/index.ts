import { API_URL, LIVE } from "@/lib/config";
import { demoServices } from "./demo";
import { liveServices } from "./live";
import type { ConnectionStatus, ZephyrServices } from "./types";

export type { ConnectionStatus, ZephyrServices } from "./types";
export { liveApi, ApiError } from "./live";

/**
 * Single access point for data services. `NEXT_PUBLIC_API_URL` selects the
 * live FastAPI backend; otherwise the offline demo fixtures are used.
 */
export const services: ZephyrServices = LIVE ? liveServices : demoServices;

export const connectionStatus: ConnectionStatus = {
  mode: services.mode,
  label: LIVE ? "Live backend" : "Demo environment",
  detail: LIVE ? `Connected to ${API_URL}` : "NEXT_PUBLIC_API_URL is not set. Showing simulated demo data.",
  backendConfigured: LIVE,
};
