# Centralize client fetching on apiFetch

## Problem

src/lib/api.ts already has an apiFetch() wrapper, but only project-page-controller.ts uses it. The two big state modules ignore it:

- src/components/ticket/ticket-detail-state.ts (~441 lines): ~15 ad-hoc fetch calls.
- src/components/launcher/launcher-settings-state.ts (~402 lines): ~20 ad-hoc fetch calls; putField() helper reduces some duplication but error handling is still repeated.
- agent-launcher-controller.ts: more raw fetch calls with manual status parsing.

Each call site carries its own copy of .catch(e => setError(...)) / "Failed to X" error plumbing -- roughly 35 duplicated error-handling blocks across the two state files.

## Goal

All client data access goes through apiFetch, returning the shared request/response types from ST-0026, with one error-reporting hook so per-call error plumbing disappears.

## To do

- Extend apiFetch as needed (method/body support, typed response, structured error with server-provided message). Errors must surface to the user, never be swallowed.
- Add a single error-reporting hook (e.g. controller-provided onError) instead of per-call setError copies.
- Migrate ticket-detail-state.ts, launcher-settings-state.ts, and agent-launcher-controller.ts to apiFetch.
- Remove the now-redundant per-call catch blocks; verify every failure path still shows an error in the UI.

Depends on: ST-0026 (shared types) -- can start independently, but typed responses land with ST-0026.
