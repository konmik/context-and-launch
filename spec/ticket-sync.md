# Ticket Sync

- Stage all files and commit if dirty
- Resolve upstream tracking branch
  - No upstream exists
    - Push
    - Done
- Squash: if more than 1 commit ahead of upstream, soft-reset and re-commit as one
- Fetch
- Rebase onto upstream (no-op if not behind)
  - Rebase fails with conflict
    - Return "conflict"
  - Rebase fails for other reason (e.g. hook)
    - Return error
- If there were local commits, push
- Done
