# Sync Pending Indicator

- Board page opens with the indicator hidden
- Browser polls the pending endpoint immediately, then every 2 seconds
  - Skip a tick if the previous request is still in flight
  - Request fails
    - Log a warning, keep the last known value
  - Switching projects hides the indicator and restarts polling for the new project
- Server answers from a per-worktree cache
  - Cache valid
    - Return cached value
  - Cache stale
    - Compute: worktree differs from upstream, or untracked files exist, or either git check fails
    - Cache and return the result
- Cache is invalidated when
  - The file watcher sees any change in the worktree
  - A sync or sync-abort completes
- Browser shows a yellow dot on the sync button when pending
  - A conflict badge takes precedence over the dot
