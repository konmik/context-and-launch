# Issue tracker: Context & Launch

Issues for this repo are tracked using the app's own ticket system. Tickets are stored as folders in a git worktree checked out on an orphan branch.

## Conventions

- Each ticket is a folder named by kebab-casing the ticket number and title (e.g. `st-0006-fix-login-timeout/`)
- A ticket folder contains a `status.json` (holding status, ticket number, title, and metadata) and zero or more context markdown files
- Ticket status is stored in `status.json` as a string matching a board column slug
- The ticket worktree lives at `~/.context-launch/projects/{projectSlug}/tickets/`

## When a skill says "publish to the issue tracker"

Create a new ticket folder in the worktree with a `status.json` and any relevant context markdown files. Use the app's conventions for ticket numbering and folder naming.

## When a skill says "fetch the relevant ticket"

Read the ticket folder at the referenced path. The user will pass the ticket number or folder name.