/** Base URL of the live Zephyr FastAPI backend. Directly points to localhost:8000 with no env abstraction needed. */
export const API_URL = "http://localhost:8000";

/** True when a backend URL is configured: the app shows live backend state. */
export const LIVE = true;

/** Poll interval for GET /api/v1/pending_alerts (1200 ms: between 1-1.5s). */
export const POLL_MS = 1200;

