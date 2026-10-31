/** Base URL of the live Zephyr FastAPI backend. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** True when a backend URL is configured: the app shows live backend state. */
export const LIVE = true;

/** Poll interval for GET /api/v1/pending_alerts (1200 ms: between 1-1.5s). */
export const POLL_MS = 1200;

