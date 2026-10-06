# Addressed Claude review bridge

Requires Python 3 (stdlib), installed/authenticated Claude Code CLI with `--json-schema`, `--session-id`, `--resume`, `--no-chrome` and `--strict-mcp-config`. Verified with Claude 2.1.289. No SDK or API key file is needed. Uses the existing CLI login without reading its credentials.

Create a private state directory outside the repository, once per task/session. Save `session.json` with a freshly generated UUID as `session_id`, `started: false`, the absolute Claude `executable`, and optional `timeout_seconds` (240 default). Save `empty-mcp.json` as `{"mcpServers":{}}` and `local-settings.json` as `{"permissions":{"deny":["Bash","Edit","Write","WebFetch","WebSearch"]}}`. The launcher passes an empty tool list, disables Chrome for this separate local reviewer, and restricts MCP to the empty configuration. It does not modify existing browser launchers/settings. Do not reuse an active interactive session.

```sh
python3 scripts/coordination/bridge.py --state-dir /absolute/private/state --cwd /absolute/worktree --task review-1 --prompt-file /absolute/private/review.txt
```

Supply only curated nonsensitive source/evidence. A result receipt has `received_pending_review` until the coordinator checks evidence. The demo's exact arithmetic assertions produce `verified`. A prompt digest binds each task ID: the same task returns its existing receipt; changed input needs a new task ID. Tool-free turns can be retried safely; mutations remain Codex's responsibility and need separate result checks.

The state records exact session ID, last task/result/next step and pending process metadata. A lock and exact process/session check prevent concurrent dispatch. No raw CLI output/error stream is persisted. Heartbeats report only task ID and PID. A 240-second deadline stops only this launcher's child; it leaves a reconciliation-required record. A single clarification handles incomplete output. Transient connection resets/timeouts get at most two retries (2/4 seconds); permission denials never retry.

Before reconciliation inspect the process, exact session, files and performed operations. Save evidence with `process_stopped`, `session_checked`, `files_checked`, `operations_checked` all true, plus explanatory findings. If the result already completed, include its schema-valid `completed_result`; otherwise explicitly set `safe_to_resume_tool_free: true`. Then:

```sh
python3 scripts/coordination/bridge.py --state-dir /absolute/private/state --cwd /absolute/worktree --reconcile /absolute/private/evidence.json
```

The bridge preserves a `.reconciled.json` history and completed receipt; it never deletes state to force a retry. Evidence flags are coordinator attestations, not a substitute for inspecting reality.

```sh
npm run test:coordination
python3 scripts/coordination/demo.py /absolute/private/state
```

Run from a Git worktree with an existing HEAD; missing Git or a non-Git directory fails closed. State belongs outside that worktree.

The real demo performs three dependent exchanges in one exact session and verifies each result before the next. Simulations cover incomplete results, a real child crash after a durable local effect, receipt-based nonduplication, pending/busy detection, bounded retries, permission denial, input-path validation and error redaction. They do not exercise production or user Chrome.

Reconciliation also requires the original Git worktree. Evidence must be nonsensitive, and must not depend on literal credential-shaped strings: redaction intentionally changes them and an exact receipt comparison then fails closed.
