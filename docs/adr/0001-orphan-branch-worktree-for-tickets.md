# Orphan branch + worktree for ticket storage

Tickets are stored in a git orphan branch (`context-launch`) checked out as a worktree, rather than in the project's main branch or in a separate database/repo. This keeps ticket history fully in git (reviewable, mergeable, portable) without polluting the project's code history. The worktree lets the server read and write tickets without disturbing the user's working tree.

## Considered Options

- Store tickets in the project's main branch. Rejected: ticket churn (status changes, notes) would clutter the code commit log and create merge friction.
- Separate database (SQLite, JSON file outside git). Rejected: loses git's history, branching, and merge semantics — the whole point is that tickets are git-native and shareable via push/pull.
- Separate git repo for tickets. Rejected: adds a second repo to manage per project with no clear benefit over an orphan branch in the same repo.
