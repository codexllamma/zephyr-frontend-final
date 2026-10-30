# Project Zephyr — Security Operations Demo (frontend)

Zephyr is an **autonomous SOC agent**: a network sensor raises alerts, a fine-tuned LLM *proposes* a mitigation, a **deterministic Critic** (plain code, no AI) validates it, a **human** approves it, and only then is it executed inside the target container. Every decision becomes a chosen/rejected pair that feeds GRPO training.

> *Probabilistic reasoning proposes the action. Deterministic code enforces the execution boundary.*

This repository is the **frontend demo**. It runs locally with no Docker, GPU or backend. Everything is clearly labelled **DEMO ENVIRONMENT**.

## The four tabs

| Tab | What it shows |
|---|---|
| **Simulation** | Packet-Tracer-style topology (5 containers `pc-1…pc-5` on bridge `br-zephyr`) built with React Flow, device inspector, scenario runner (Normal / Flash-Sale Surge / Suspicious Traffic), safe simulated terminal, event timeline, recent alerts. |
| **Alerts & Review** | Searchable/filterable/sortable alert list, evidence, mitigation proposal with rejected alternative, live Critic checklist, lifecycle stepper, "explain the decision", and working **Approve / Reject / Request Revision / Mark as Benign**. |
| **Training & Decisions** | Training pairs and decision history (derived from the same alerts, shared IDs), record inspector, and the project-provided benchmark snapshot. |
| **Architecture** | Interactive React Flow diagram of the six layers, with node inspector, MiniMap, fit/reset view, "trace selected alert", and a legend marking what is implemented, simulated, or planned. |

Shell: all navigation lives in the hamburger drawer (no top-bar tabs); the top bar has the wordmark, `DEMO ENVIRONMENT` badge, dark/light toggle (persisted, no flash) and, at the far right, the `Admin3` profile (hard-coded, **no authentication**). A live CRITICAL alert makes the hamburger, a top-bar pill and the Alerts & Review menu item blink until Alerts & Review is opened. Both React Flow canvases (topology and architecture) have no manual navigation: no zoom/fit/pan buttons, minimap, drag, or keyboard panning. By default the camera tours the nodes by itself: it zooms into the first node, glides slowly to each next one (overview → attacker → victim → core gateway on the topology; overview → NIDSAlert → MitigationEnvelope → Critic on the architecture), then rewinds and repeats. Click the canvas to pause on the current node (click again to resume); scrolling over the canvas also stops autoplay and steers the camera to other nodes, and autoplay does not restart until you click. While paused you can also drag the canvas sideways to move to other nodes. Run Scenario (or **Shift + R** on the Simulation tab) pulls the topology camera back to the full view and scrolls down to the event timeline and terminal. Reversing the scroll retraces the path; at either end scroll passes through to the page. Camera code: `lib/camera.ts`, `hooks/useScrollCamera.ts`. While a scenario runs, every event streams into the terminals as colour-coded log lines.

## Prerequisites
Node.js 20.9+ (tested on the version in this environment) and npm.

## Install and run
```bash
npm ci            # or: npm install
npm run dev       # http://localhost:3000  (redirects to /simulation)
```
Production build:
```bash
npm run build
npm start
```
Checks: `npx tsc --noEmit` · `npm run lint`

## Keyboard
- **Shift + Q** cycles the tabs (Simulation → Alerts & Review → Training & Decisions → Architecture → wrap). Ignored while typing in inputs or the terminal.
- Theme: use the sun/moon button in the top bar. The choice is saved in `localStorage`.

## Demo scenarios and data
- **Normal Traffic** – routine flows, no alerts.
- **Flash-Sale Surge** – a 2,762-packet burst raises an alert but is judged benign; Zephyr proposes `NO_OP` (high traffic ≠ malicious). Awaits human review.
- **Suspicious Traffic** – a SYN flood. Model attempt 1 is *genuinely rejected* by the Critic (hallucinated IP, forbidden `-P INPUT DROP`, over-broad `ISOLATE_NODE`); the error list goes back, attempt 2 passes, then a human reviews.
Run → open **Alerts & Review** → Approve. The pipeline then runs validation → execution (simulated) and the Training/Decisions tabs update.

All fixtures live in `data/` and are marked `DEMO DATA`. The simulated clock is deterministic. State is in memory: a full browser reload resets the demo (use **Reset Demo** to reset in-app).

## What is simulated vs. real
| Real in this frontend | Simulated / fixture |
|---|---|
| The deterministic **Critic** (`lib/critic.ts`) — checklist results are computed from the proposal | NIDS alerts, packet counts, IPs (illustrative `172.28.0.x`) |
| Review workflow and shared state across tabs | LLM proposals (scripted, **no inference**) |
| Derivation of decisions and training pairs | "Execution": marked *simulated*; no firewall rule touches any container |
| Theme, navigation, React Flow diagrams | Terminal: a lookup table of predefined commands (`help clear whoami hostname pwd ls ip addr ip route iptables -L INPUT -n docker ps date`). It **never executes input**, has no shell or Docker socket. |

Benchmark figures (100% schema compliance, +7.96/8 mean reward, 2.61 s on Tesla T4, 14.90 s local GGUF, etc.) are **project-provided, not independently verified**, and do not mean the system is 100% secure.

## Connecting a real backend
`lib/services/types.ts` defines `ZephyrServices` (topology, scenarios, alerts, terminal, mitigation, critic, review, execution, training, decisions, evaluation). Implement it against your APIs and return it from `lib/services/index.ts` (use `NEXT_PUBLIC_ZEPHYR_API_URL`). The demo provider is `lib/services/demo.ts`. Note the live UI state machine (`lib/demo-state.ts`) currently drives scenarios from fixtures; wiring live events means feeding the same actions from a stream.

## Project layout
`app/` routes · `components/` shell, providers, ui · `features/` per-tab views · `data/` fixtures · `lib/` critic, terminal engine, selectors, reducer, services · `types/` shared types · `hooks/` · global tokens in `app/globals.css`.

## Verification performed
Run in a headless Chromium against the production build: `tsc --noEmit`, `eslint`, `next build` all clean; dark/light theme + persistence; all four tabs; hamburger drawer and `Admin3` profile; Shift+Q cycling and terminal exemption; scenario runner; terminal commands; alert approval → simulated execution; shared state across tabs via client navigation; Training/Decisions update; scroll-driven camera (both canvases), node selection; no horizontal scroll at 390 px; **0 console errors/warnings**.

## Known limitations
- Not verified in Safari/Firefox, with screen readers, or on physical devices; accessibility was built in (labels, focus, roles) but not audited.
- State is in-memory (reload resets). No authentication. No backend adapter implemented.
- The canvases are scroll-only by design: keyboard users cannot move the camera or focus graph nodes, and touch support is implemented but untested on a real device.
- The mobile layout is functional but the topology canvas is small; pan/zoom to explore.
- Only the Flash-Sale and Suspicious scenarios create new alerts; historical alerts are fixtures.
