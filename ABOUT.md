# dploy

Building is fast now. Deploying isn't. `dploy` closes the gap: one command, any repo, a live URL.

> Numbers in `{{braces}}` are placeholders — fill in before publishing.

---

## Inspiration

The time to build a working app has collapsed — twenty minutes of Cursor and a prompt gets you a usable prototype. The time to *deploy* it hasn't moved. Vercel, Fly, Modal, and Render all assume someone has already decided the runtime, entrypoint, port, and env. That assumption was fine when builds took hours. When builds take minutes, deploy latency dominates the iteration loop.

The slow part isn't running the code — it's the inference around it. A model can do that in seconds given a shell. Sandboxes and tunnels are commodity. What's missing is the agent that decides *what* to run. `dploy` is that piece.

## What it does

Point `dploy` at a GitHub URL, get a live public URL. No config file, no framework detection rules.

The pipeline has three stages, each with a single job:

1. **Heuristic fast-path.** If the repo root is unambiguous — `package.json` with a `start` script, `pyproject.toml` with FastAPI/Flask/Streamlit and a known entrypoint, `go.mod` with a port grep-able out of `main.go` — synthesize the plan from file contents alone, no LLM. Conservative by design: any Dockerfile, any ambiguity falls through to the agent.
2. **Agent #1 — Analyze.** Reads the tree, writes a structured plan (`runtime`, `install_commands`, `build_commands`, `start_command`, `port_hint`, `env_required`, `confidence`) to a JSON file inside the sandbox.
3. **Agent #2 — Expose.** Runs install and build, starts the server in the background, finds the bound port from `ss -tlnp`, verifies HTTP, and — critically — if the server bound to `127.0.0.1` instead of `0.0.0.0`, kills it and restarts with the right host flag before giving up.

A Modal tunnel is opened for the reported port (from a fixed `TUNNELABLE_PORTS` set — 3000, 3001, 4000, 4321, 5000, 5173, 8000, 8080, 8081, 8501, 8888, 9000 — which covers the common frameworks; anything outside degrades to "reachable inside the sandbox only" with a visible warning).

Failures are structured. The agent reports one of: `no_runnable_app`, `install_failed`, `build_failed`, `start_failed`, `no_port_detected`, `port_only_localhost`, `missing_env_var`, `timeout`, `other` — surfaced to the CLI with the offending log lines attached.

## How we built it

| Layer | Tech |
| --- | --- |
| CLI | TypeScript + [Ink](https://github.com/vadimdemedes/ink) — spinner / plan / streamed build logs |
| Frontend | React + Vite — Dashboard, DeploymentDetail, GitHub OAuth sign-in |
| Backend | FastAPI + async SQLAlchemy + Pydantic, short-lived sessions per checkpoint |
| Sandbox | [Modal](https://modal.com) sandbox, image baked with Node 22 / Python 3 / Go / pnpm / yarn / bun / OpenClaw |
| Agent runtime | [OpenClaw](https://openclaw.dev) gateway + Claude Haiku 4.5 |

A few design decisions that turned out to matter more than expected:

**Structured output via file + sentinel.** OpenClaw owns its own inner tool loop (shell, file ops, HTTP), so we don't attach our own tool schemas. Instead, each agent's system prompt ends with a "final answer protocol": write a JSON object to a known path, then reply with a single-line sentinel (`PLAN_WRITTEN`, `PORT_WRITTEN`, or `FAILED`). The orchestrator reads the file after the chat round-trip. Parse failures surface as "agent did not write report" with the last assistant text attached — a concrete debug message instead of a silent schema error.

**Warm sandbox pool.** A sandbox with the gateway already up and the model already set sits ready; `acquire(model)` hands it off in constant time on a hit, otherwise provisions synchronously and kicks a background replenish. On a model mismatch it does a cheap `set_model` swap instead of a full re-create. This is what hides the ~18s gateway cold-start from the user.

**Haiku 4.5 as default, with tool denylist.** The Analyze/Expose workload is many small tool turns where prefill speed dominates. Haiku 4.5 is roughly 2× faster prefill than Sonnet on this shape. On top of that, OpenClaw ships with image/video/browser/pdf tools we never use — putting them on the deny list removes their schemas from every prefill, saving tokens per turn. Model is overridable per deployment.

**Idempotency keyed by `(user_id, upload_id)`.** A retried `POST /deployments` collapses to the same row instead of spawning a second sandbox. Important because the CLI retries on transient failures and users hammer the command when they think it's stuck.

## Challenges we ran into

- **The `0.0.0.0` problem.** Many frameworks bind `127.0.0.1` by default. Inside a sandbox, that's invisible from outside — the Modal tunnel will 502. Agent #1's system prompt enforces "start command MUST bind to `0.0.0.0`" and injects the right env var for the detected framework (`HOST`, `HOSTNAME`, etc.); Agent #2 double-checks `ss -tlnp` and restarts the process with the correct flag if it's wrong. `port_only_localhost` is a first-class failure reason.
- **Gateway cold-start.** ~18s to bring OpenClaw up in a fresh sandbox. The warm pool hides it, but making replenishment strictly best-effort (so a failed warm-up never stalls the next acquire) took a few iterations. A concurrent-acquires race was fixed with a `_replenishing` set guarding the model being warmed.
- **Port discovery on messy repos.** Repos often read `PORT` from env, fall back to one of several framework defaults, or bind something that conflicts with OpenClaw's own 18789. Agent #2 can't trust the hint — it has to diff `ss -tlnp` against the start command's PID.
- **Tunnel port set is fixed.** Modal only tunnels ports declared at sandbox creation. We pre-declare the common framework ports; exotic ports degrade gracefully to "internal only" with a warning line in the deployment logs.
- **Structured failure propagation.** Every failure inside the sandbox has to make it back to a Pydantic error row, and then to the CLI's error panel, without losing the evidence. The `reason_code` + `evidence` fields in the failure schema are load-bearing for debuggability.

## Accomplishments that we're proud of

- **Heuristic fast-path.** Unambiguous repos skip the LLM entirely — collapsing the 60–90s Analyze turn into a sub-second file-listing round-trip. The single biggest latency win in the system.
- **Median time-to-URL `{{seconds}}`s**, 95th percentile `{{seconds}}`s — deploy latency on the same order as the build itself.
- **`{{cost}}` per deploy** after heuristic, warm pool, Haiku, and tool denylisting.
- **`port_only_localhost` auto-recovery.** Agent #2 fixing binds that would otherwise be invisible, rather than reporting a dead URL.
- **Honest rejection.** Out-of-scope repos fail with a reason code in ~15s, not mid-install.

## What we learned

- **Build speed and deploy speed are now the same problem.** Treating deploy as a separate, heavier pipeline is a leftover from when builds were slow.
- **The highest-leverage optimization is skipping the LLM.** Every constant-time deterministic check that covers a common case is worth more than any prompt tuning.
- **Prefill dominates for tool-heavy agents.** Removing unused tools from the schema saves tokens on every turn, not just the first.
- **Structured failures beat structured success.** Getting the failure taxonomy right (`port_only_localhost` vs `no_port_detected` vs `start_failed`) made the system debuggable by the user, not just by us.
- **Agents are infrastructure.** Sandbox reliability, the pool, and the JSON-report pattern mattered more than prompt wording ever did.

## What's next for dploy

- **More heuristics.** Dockerfile with a single `CMD`, Procfile, `pnpm` workspaces with a single app, Django with `manage.py`. Each one collapses another LLM round-trip to a file read.
- **Bigger warm pool.** Multi-model, sized to observed traffic, eviction by last-used rather than age.
- **Shareable ephemeral links** with a visible countdown. The point is sharing code, not running infra.
- **Reproducibility manifests.** Sign the plan (tree hash + runtime + commands + env); re-deploying the same commit produces an identical plan or fails closed. Makes rollback trivial.
- **Public failure-taxonomy benchmark.** The `reason_code` set plus its repo-level ground truth is the dataset we wished existed when we started.
- **Scope expansion.** Multi-service and migration-bearing repos next — no widening until the current class clears its latency and boot-rate targets.
