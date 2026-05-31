# Archive Ticket

- User opens the ticket menu and clicks Archive
- Ticket uses a worktree
  - Show cleanup dialog (option to delete worktree, local branch, remote branch)
  - Run selected cleanup steps first
    - Any cleanup fails: return error, stop
- Ticket does not use a worktree
  - Show confirmation dialog
- Create archive directory if it does not exist
- Archive destination already exists: throw error
- Move the ticket folder into archive
- Remove ticket from the order store
- Archived tickets are excluded from the board
