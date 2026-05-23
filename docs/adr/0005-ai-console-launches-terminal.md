# AI Console launches a separate terminal instead of embedding a session

Replace the embedded AI Console (subprocess with SSE streaming, event history, and in-app messaging) with a simple launcher that opens Claude Code in a separate terminal window. The user interacts with Claude directly in the terminal rather than through the web UI.

## Key decisions

Launch mechanism: spawn `wt -d <projectPath> claude "<initial message>"` via Node. Windows Terminal for now; the command will be user-configurable later to support other platforms and terminals.

Initial message: always `Current ticket files are in <ticketDir>. Read the files there for context.` No user-provided message, no session ID, no flags beyond what Claude Code needs interactively.

No state tracking: the app does not track whether the terminal is open, what Claude is doing, or when it exits. Fire and forget.

## Considered alternatives

- Keep the embedded subprocess with SSE streaming. Rejected: the app was reimplementing a terminal badly. The user gets a better experience interacting with Claude Code directly (permission prompts, full TUI, native scrollback).
- Use expect/send or node-pty to inject the initial prompt. Rejected: Claude Code accepts an initial prompt as a positional CLI argument, so no terminal automation is needed.
- Track the spawned process for status. Rejected: adds complexity for little value when the user can see the terminal window directly.
