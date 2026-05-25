# AI Stages — Glossary

A kanban-style project management tool that stores tickets as folders in a git-backed worktree.

## Language

### Projects & Registry

Project:
A reference to a local git repository on disk that ai-stages manages. Defined by its filesystem path.
Avoid: repo, repository

Project Registry:
A JSON config file at `~/.ai-stages/config/config.json` that stores the list of registered projects and the last-used project slug. Lives outside any project repo.
Avoid: config, settings

Slug:
A short URL-friendly identifier for a project, derived from its directory name (e.g. `my-repo`). Used in URLs like `/project/my-repo`. Editable by the user. Must be unique across the registry.
Avoid: id, key

### Tickets & Board

Ticket:
A unit of work. Stored as a folder in the project's worktree. Contains a `status.json` and zero or more stage markdowns.
Avoid: task, issue, card

Ticket Number:
An identifier for a ticket following the pattern PREFIX-ZEROPADDEDNUMBER (e.g. `ST-0006`, `BUG-0012`). Auto-suggested from the most recently created ticket's prefix and the highest number with that prefix + 1. Editable by the user. Falls back to manual entry when no parseable ticket exists.
Avoid: ticket id

Ticket Folder:
A directory named by kebab-casing the ticket number and title (e.g. `abc-1-fix-login-timeout/`). Contains `status.json` and stage markdowns.

Stage Markdown:
A markdown file inside a ticket folder, named after a board column (e.g. `todo.md`, `review.md`). Created on demand. Holds notes, context, or instructions for that stage. Read by AI agents working on the ticket.
Avoid: stage file, phase file

Board Config:
A JSON file in `~/.ai-stages/config/board-config/` that defines the ordered list of columns for a kanban board (e.g. `kanban.json`). A project references one by name.
Avoid: column config, workflow

Column:
A named stage in a board config representing a ticket status (e.g. `todo`, `prd`, `in-progress`, `review`, `done`).
Avoid: lane, swimlane, stage

### Git Infrastructure

Worktree:
A git worktree checked out at `~/.ai-stages/projects/{slug}/tickets/` from the project repo's orphan branch. All ticket folders live here.
Avoid: checkout, workspace

Orphan Branch:
A git branch named `ai-stages` with no common history with the project's main branch. Holds ticket data without polluting code history.

### Agent Launcher

Agent Launcher:
A tab inside the Ticket Detail Dialog that assembles a prompt from a Template and checked Skills, then launches Claude Code in a separate terminal window using the selected Coding Agent Profile. The user interacts with Claude directly in the terminal.
Avoid: AI console, terminal, shell, CLI

Coding Agent Profile:
A named command string that controls how Claude is launched from the Agent Launcher. Contains a name and a command. The server executes the command with parameters appended (initialPrompt, ticketTitle). The app ships default profiles for Windows and macOS backed by user-editable platform scripts in `~/.ai-stages/config/`.
Avoid: claude config, claude instance, agent config

Template:
A named prompt string with placeholders (e.g. `{{ticketDir}}`, `{{ticketTitle}}`). One template is selected as the base prompt in the Agent Launcher. Interpolated after skill text is appended.
Avoid: prompt, instruction

Skill:
A named template string that appends to the base Template when checked in the Agent Launcher. Uses the same placeholder syntax as Templates.
Avoid: addon, plugin, extension

Placeholder:
A `{{variable}}` reference in a Template or Skill that gets replaced with a runtime value at launch time. Available: `{{ticketDir}}`, `{{ticketSlug}}`, `{{ticketTitle}}`, `{{ticketNumber}}`, `{{ticketStatus}}`, `{{projectPath}}`, `{{projectSlug}}`.

Launcher Config:
A JSON file defining available Templates, Skills, Coding Agent Profiles, and launcher settings. Exists at two scopes: app-level (`~/.ai-stages/config/launcher-config.json`) and project-level (`~/.ai-stages/projects/{slug}/config/launcher-config.json`). Project-level merges additively with app-level; project wins on name collision.
Avoid: agent config, prompt config

Settings:
The dialog for managing Launcher Config entries (Templates, Skills, Coding Agent Profiles) and launcher settings like the worktree root path. Accessible from the board UI.
Avoid: launcher settings, preferences

Agent Worktree:
A git worktree created from the project's main branch for an agent to work in isolation. Located under a user-configured worktree root path (defaults to `~/.ai-stages/projects/{slug}/worktrees/`). Branch named `ai/{folderName}`. Reused across runs.
Avoid: sandbox, workspace

## Relationships

- A Project has exactly one Worktree (created automatically on first board load)
- A Worktree is checked out from the Project's Orphan Branch
- A Worktree contains zero or more Ticket Folders
- A Ticket Folder contains exactly one `status.json` and zero or more Stage Markdowns
- A Board Config defines the set of Columns available to a Project
- A Column name determines the filename of its Stage Markdown (e.g. column `review` → `review.md`)
- The Agent Launcher assembles a prompt from a Template and zero or more Skills
- A Launcher Config exists at app scope and optionally at project scope; project merges into app
- An Agent Worktree branches from the Project's main branch, named `ai/{folderName}`
- The Agent Launcher remembers the last-used Template, checked Skills, and Coding Agent Profile per Column

## Disk layout

Config files live under `~/.ai-stages/config/`: the Project Registry, app-level Launcher Config, Board Configs, and platform scripts. This directory is designed to be shared across machines via symlink or sync tool.

Per-project data lives under `~/.ai-stages/projects/{slug}/`. Each project gets:
- A `config/` directory with its project-level Launcher Config (local-only, not versioned)
- A `tickets/` directory that is a git Worktree of the Orphan Branch — this stores all Ticket Folders
- A `worktrees/` directory (by default) for Agent Worktrees — git checkouts of main/master where agents do their work

The Worktree (`tickets/`) and Agent Worktrees (`worktrees/`) are separate git checkouts: the Worktree holds ticket data on the orphan branch, Agent Worktrees hold real code from main.