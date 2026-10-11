<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Codex ↔ Claude coordination

Codex owns the active task, filesystem changes, verification and authorized external operations. When a task explicitly requests Claude review, use `scripts/coordination/bridge.py` with an explicit state directory and exact saved Claude session UUID. Never select the last session with `--continue`, inject prompts using terminal keystrokes, or start a second executor for the same task. Preserve existing interactive Chrome sessions and their permissions.

Read current PLAN.md, STATE.json and stage report before resuming. Check the actual Goal with the goal tool if available; this instruction alone does not create an active Goal. Record the task, session ID, input digest, receipt, independent verification and next action outside the repository. Do not store credentials, cookies, raw session transcripts or confirmation/invitation URLs.

The local bridge is deliberately a **tool-free reviewer**, using supported Claude CLI `-p --output-format json --json-schema` and `--resume <exact UUID>`. Codex supplies curated source and evidence, then independently checks every finding. It does not automate browser permissions or substitute for a permission-gated tool. Do not disable permission checks or expand global permissions.

Run the full loop: dispatch → wait with brief progress → consume structured result/errors → inspect evidence → correct or send the next task. A delivered answer is not an independently verified result. Do not end an active task merely because a message was sent or received.

A pending record, process timeout or lost answer requires reconciliation of process/session/files/operations before any retry. Completed task receipts prevent duplicate dispatch. Permission refusals stop that action; only classified transient network failures receive the bounded tool-free retries. Repeated failure without new evidence requires diagnosis. No blind retries of mutations. See `scripts/coordination/README.md` for setup and recovery.

Production actions, retained accounts/salons, migrations, Merge and Deploy require the task's explicit authorization; local review does not grant it. Preserve parallel work and unrelated browser profiles/projects.
