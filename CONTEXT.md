# AI Stages — Glossary

A kanban-style project management tool that stores tickets as folders in a git-backed worktree.

## Language

### Projects & Registry

Project:
A reference to a local git repository on disk that ai-stages manages. Defined by its filesystem path.
Avoid: repo, repository

Project Registry:
A JSON config file at `~/.ai-stages/config.json` that stores the list of registered projects and the last-used project slug. Lives outside any project repo.
Avoid: config, settings

Slug:
A short URL-friendly identifier for a project, derived from its directory name (e.g. `my-repo`). Used in URLs like `/project/my-repo`. Editable by the user. Must be unique across the registry.
Avoid: id, key

### Tickets & Board

Ticket:
A unit of work. Stored as a folder in the project's worktree. Contains a `status.json` and zero or more stage markdowns.
Avoid: task, issue, card

Ticket Number:
A free-text identifier for a ticket, entered by the user (e.g. `ABC-1`, `42`). Not auto-generated or enforced.
Avoid: ticket id

Ticket Folder:
A directory named by kebab-casing the ticket number and title (e.g. `abc-1-fix-login-timeout/`). Contains `status.json` and stage markdowns.

Stage Markdown:
A markdown file inside a ticket folder, named after a board column (e.g. `todo.md`, `review.md`). Created on demand. Holds notes, context, or instructions for that stage. Read by AI agents working on the ticket.
Avoid: stage file, phase file

Board Config:
A JSON file in `~/.ai-stages/board-config/` that defines the ordered list of columns for a kanban board (e.g. `kanban.json`). A project references one by name.
Avoid: column config, workflow

Column:
A named stage in a board config representing a ticket status (e.g. `todo`, `prd`, `in-progress`, `review`, `done`).
Avoid: lane, swimlane, stage

### Git Infrastructure

Worktree:
A git worktree checked out at `~/.ai-stages/worktrees/{slug}/` from the project repo's orphan branch. All ticket folders live here.
Avoid: checkout, workspace

Orphan Branch:
A git branch named `ai-stages` with no common history with the project's main branch. Holds ticket data without polluting code history.

### AI Console

AI Console:
A tab inside the Ticket Detail Dialog that runs Claude Code as a server-side process and streams its output to the browser. Provides an input field for user prompts and a kill button to stop the process.
Avoid: terminal, shell, CLI

Session:
A Claude Code conversation tied to a ticket. Identified by a session ID stored in the ticket's `status.json`. Resumable across process restarts via `--resume`. One session per ticket.
Avoid: run, conversation

Event History:
A JSON file at `~/.ai-stages/runs/` that persists the stream of console events for a ticket's session. Survives server restarts. Accumulates across `/clear` boundaries.
Avoid: log, transcript

## Relationships

- A Project has exactly one Worktree (created automatically on first board load)
- A Worktree is checked out from the Project's Orphan Branch
- A Worktree contains zero or more Ticket Folders
- A Ticket Folder contains exactly one `status.json` and zero or more Stage Markdowns
- A Board Config defines the set of Columns available to a Project
- A Column name determines the filename of its Stage Markdown (e.g. column `review` → `review.md`)
- A Ticket has at most one Session (created on first "Run")
- A Session has one Event History file (persisted at `~/.ai-stages/runs/`)
- The AI Console tab displays the Event History and live-streams new events via SSE