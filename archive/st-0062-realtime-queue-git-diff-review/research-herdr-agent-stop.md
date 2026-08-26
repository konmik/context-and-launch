# Herdr: safe queued-prompt delivery

Research date: 2026-07-25  
Installed version: `0.7.4-preview.2026-07-17-813fec141faa`

## Conclusion

Herdr does **not** expose an authoritative “the current turn and every background/subagent task have completely stopped” signal.

Therefore, queued prompts cannot meet that safety requirement by gating on Herdr alone. In particular, do not use `idle`, `done`, `agent wait`, or `pane.process-info` as proof that all work has stopped.

If “completely stopped” literally means that the agent process exited, Herdr cannot then deliver to that same agent: agent-addressed input requires a live agent identity. What the feature actually needs is an agent-native, turn-level completion signal that includes all descendant/background work. Herdr currently does not provide one for Codex or Claude Code.

## What Herdr statuses mean

Herdr describes `working` as actively running, `done` as finished but unseen, `idle` as “finished or waiting” and seen, and `unknown` as not confidently classified. `done` is only the unseen presentation of the same underlying idle state; it is not a stronger completion state. [Herdr concepts at the installed commit](https://github.com/ogulcancelik/herdr/blob/813fec141faabe0615b66c4f1738c0af7581309c/docs/next/website/src/content/docs/concepts.mdx#L39-L49)

For Codex and Claude Code, Herdr explicitly says their integrations are **not lifecycle authorities**. State is derived from the live terminal screen because their hooks do not cover the full lifecycle and can miss transitions. When no screen rule matches, a known agent falls back to `idle`; the documentation warns that such classifications “should not make Herdr send input or take destructive action.” [Herdr agent-status authority and warning](https://github.com/ogulcancelik/herdr/blob/813fec141faabe0615b66c4f1738c0af7581309c/docs/next/website/src/content/docs/agents.mdx#L36-L56)

This directly covers the reported failure mode. Herdr issue [#1366](https://github.com/ogulcancelik/herdr/issues/1366) records Claude Code's `/btw` input box causing a `working` → `idle` classification while the original turn continued in the background. Herdr treats that as a detector bug, not as a legitimate “input-ready but still working” state. Version 0.7.4 added screen-pattern fixes for this case, but detection remains heuristic. [Herdr 0.7.4 changelog](https://github.com/ogulcancelik/herdr/blob/813fec141faabe0615b66c4f1738c0af7581309c/CHANGELOG.md#L21-L27)

## Command behavior in the installed preview

`herdr agent wait <target> --status idle` observes semantic status. It returns immediately when the current status is either `idle` **or `done`**, so it adds no stronger completion guarantee. [Installed `agent wait` implementation](https://github.com/ogulcancelik/herdr/blob/813fec141faabe0615b66c4f1738c0af7581309c/src/cli/agent.rs#L479-L520), [idle/done equivalence](https://github.com/ogulcancelik/herdr/blob/813fec141faabe0615b66c4f1738c0af7581309c/src/cli/agent.rs#L643-L650)

`herdr agent send <target> <text>` writes literal bytes to the live terminal. It neither checks the agent status nor submits Enter. [Installed `agent send` implementation](https://github.com/ogulcancelik/herdr/blob/813fec141faabe0615b66c4f1738c0af7581309c/src/cli/agent.rs#L565-L578), [server-side byte write](https://github.com/ogulcancelik/herdr/blob/813fec141faabe0615b66c4f1738c0af7581309c/src/app/api/agents.rs#L182-L195)

`herdr pane process-info` reports the pane shell, foreground process-group ID, and foreground processes. It is process-discovery data, not an agent-turn or descendant-task completion signal, and the contract does not claim to enumerate all background/subagent work. [Herdr socket API](https://github.com/ogulcancelik/herdr/blob/813fec141faabe0615b66c4f1738c0af7581309c/docs/next/website/src/content/docs/socket-api.mdx#L196-L198)

## Newer Herdr does not add the required guarantee

Herdr 0.7.5 replaces `agent send` with an atomic `agent prompt` command and adds server-owned waits, but its documentation says:

- a prompt may be submitted while the agent is already working;
- `agent prompt --wait` and `agent wait` wait for semantic states;
- the wait does not track individual turns.

Consequently, upgrading improves prompt submission but does not supply an “all background work stopped” gate. [Current Herdr agent automation documentation](https://herdr.dev/docs/agent-automation/)

## Product implication

A reliable integration needs a per-turn identifier and a completion event whose contract includes all child/subagent/background work. Herdr status may remain useful as one observation and for display, but it cannot prove completion for Claude Code or Codex.

## Shipping decision

Ship Review Prompt queuing despite this limitation. Use Herdr's current lifecycle status as a best-effort delivery gate and accept that a queued prompt may occasionally be submitted while background work is still running. Keep this gate replaceable and adopt an authoritative Herdr turn-completion signal when Herdr provides one.
