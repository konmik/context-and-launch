# AI Console Runner

Run Claude Code from the web UI as an interactive session tied to a ticket. The user clicks "Run" from the ticket detail dialog, and a server-side Claude Code process streams output back to the browser.

## Key decisions

Session model: one session per ticket, session ID stored in `status.json`. No agent abstraction. Resume via `--resume <sessionId>`. `/clear` resets context without creating a new session.

Execution: Claude Code spawned in the project's git repo directory with `--output-format stream-json --remote-control --dangerously-skip-permissions`. No `--max-turns` or `--model` flags. Initial prompt points Claude to the ticket folder's absolute path in the worktree.

Transport: SSE for server-to-client streaming, POST endpoint for steering input (user prompts sent to stdin). Messages queued when process has exited are prepended on next resume.

UI: "AI Console" tab inside TicketDetailDialog. Assistant text rendered in full, tool calls collapsed with a counter, Agent and WebSearch shown individually. Glowing border on ticket card while process is active. Kill button with confirmation. "/clear" button visible only when running.

Persistence: event history saved to `~/.context-launch/runs/` as JSON files (one per ticket), survives server restart. Also kept in an unbounded in-memory buffer for active sessions.

Concurrency: multiple tickets can run Claude Code simultaneously, no limit.

## Considered alternatives

- WebSocket instead of SSE. Rejected: SSE is simpler, has native browser auto-reconnect, and the occasional user input fits a POST endpoint without needing a full bidirectional channel.
- Interactive permission handling instead of `--dangerously-skip-permissions`. Rejected: parsing permission prompts from the JSON stream and routing user responses adds significant complexity for little benefit at this stage.
- Event history in the ticket worktree folder. Rejected: runtime state that would clutter git history with noisy diffs on every run.
- Max-turns limit. Rejected: the kill button provides a manual safeguard, and an arbitrary limit would interrupt legitimate long-running sessions.
