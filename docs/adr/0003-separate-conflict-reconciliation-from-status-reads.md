---
status: accepted
---

# Separate Conflict Resolution Reconciliation from sync-status reads

Conflict status must remain a read-only query so Git work cannot block the board read or make a status request mutate ticket data. Conflict Resolution Reconciliation is a separate action, triggered by the status-monitoring flow when a completed resolution needs to be applied, and it targets the board query only when the live Worktree actually changes.

This preserves automatic visibility of an agent's completed resolution while keeping the board read and sync-status read independent.
