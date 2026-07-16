# Context & Launch — Glossary

A kanban-style project management tool that stores tickets as folders in a git-backed worktree.

## Language

### Projects & Registry

Project:
A reference to a local git repository on disk that Context & Launch manages. Defined by its filesystem path.
Avoid: repo, repository

Project Registry:
A JSON config file at `~/.context-launch/config/config.json` that stores the list of registered projects and the last-used project's `projectSlug`. Lives outside any project repo.
Avoid: config, settings

Project Slug:
A short URL-friendly identifier for a project, derived from its directory name (e.g. `my-repo`). Used in URLs like `/project/my-repo`. Editable by the user. Must be unique across the registry. Field name: `projectSlug`.
Avoid: id, key, bare "slug"

Column Slug:
A filesystem-safe identifier for a board column, produced by `slugifyColumnName()` from the user-typed column name (e.g. `Code Review` becomes `code-review`). Used as the column's storage key and matched against ticket statuses.
Avoid: bare "slug", column id

### Tickets & Board

Ticket:
A unit of work. Stored as a folder in the project's worktree. Contains a `status.json` and any number of Context documents.
Avoid: task, issue, card

Ticket Number:
An identifier for a ticket following the pattern PREFIX-ZEROPADDEDNUMBER (e.g. `ST-0006`, `BUG-0012`). Auto-suggested from the most recently created ticket's prefix and the highest number with that prefix + 1. Editable by the user. Falls back to manual entry when no parseable ticket exists.
Avoid: ticket id

Ticket Folder:
A directory named by kebab-casing the ticket number and title (e.g. `abc-1-fix-login-timeout/`). Contains `status.json` and Context documents.

Context:
A named markdown document attached to a ticket, stored as `{name}.md` in the ticket folder (e.g. `to-do.md`, `product-requirement-document.md`). Names are chosen freely and are not tied to board columns. Created on demand. Holds notes, requirements, or instructions read by the AI agent launched against the ticket -- the context you assemble before you launch.
Avoid: stage, stage markdown, doc, note

Board Definition:
A named board layout with an id, name, and ordered list of columns. All board definitions live in a single `~/.context-launch/config/boards.json` array. A project selects one by `boardId` in its Launcher Config (defaults to "kanban").
Avoid: column config, workflow, board config

Column:
A named stage in a Board Definition representing a ticket status (e.g. `todo`, `prd`, `in-progress`, `review`, `done`). Has a name (auto-slugified into a Column Slug, filesystem-safe, unique within its board) and an optional plain-text description displayed below the column header on the board.
Avoid: lane, swimlane, stage

Undefined Column:
A virtual column rendered at the far right of the board when any ticket's status does not match a column in the active Board Definition. Not part of the Board Definition. Styled with red frame and red title. Shows each ticket's orphaned status in red. Disappears when empty. Users can drag tickets out into real columns.
Avoid: orphan column, missing column

Archive:
A subdirectory (`archive/`) inside the worktree where tickets are moved when archived. Archived tickets are excluded from the board.
Avoid: trash, deleted

Ticket Order:
A per-column ordered list of ticket folder names stored as `order.json` in the worktree, controlling the display order of tickets within each column.
Avoid: sort order, ranking

Reference:
An absolute filesystem path stored in a ticket's `status.json`, pointing to an external file relevant to the ticket (e.g. a source file in the project repo).
Avoid: link, attachment

Ticket Detail Dialog:
The modal that opens when a ticket is clicked, containing tabs for the editor, agent launcher, and shortcuts.
Avoid: ticket modal, ticket view

### Forest View & Dependencies

Dependency:
A directed relationship where one ticket depends on another, referenced by Ticket Number. Stored as a list (`dependsOn`) in the dependent ticket's `status.json`. The dependency graph is acyclic.
Avoid: blocker, link, edge, relation

Group:
A ticket that contains other tickets. Membership is stored on each member as `memberOf` (the group's Ticket Number). Groups can be nested and participate in the dependency graph like any ticket. Grouping affects only the Forest View; the board treats a group as an ordinary ticket.
Avoid: epic, container, folder

Forest View:
An alternative to the kanban board that renders a project's tickets as a dependency forest on a pannable, zoomable surface. Tickets with no dependencies sit on the bottom row; a ticket sits above every ticket it depends on. Toggled per project from the board toolbar.
Avoid: tree view, map view, graph view

Forest Layout:
A per-worktree file (`forest-layout.json`) storing each ticket's dragged position on the Forest View, keyed by Ticket Number. Positions are relative to the containing Group's inner space. Tickets without an entry are placed automatically.
Avoid: positions file, layout config

Forest Viewport:
The saved pan position (bottom-middle point) and zoom scale of the Forest View, per project per machine. Restored when the Forest View reopens.
Avoid: camera, scroll position

### Git Infrastructure

Worktree:
A git worktree checked out from the project repo's orphan branch, holding all ticket folders. Defaults to `~/.context-launch/projects/{projectSlug}/tickets/`; the location is chosen per project on the welcome screen and stored as `ticketsPath` in the Project Registry.
Avoid: checkout, workspace

Orphan Branch:
A git branch with no common history with the project's main branch, holding ticket data without polluting code history. The worktree is checked out directly on this branch. The name is chosen per project on the welcome screen (defaults to `tickets`) and stored as `branch` in the Project Registry. On first setup, if a branch of that name already exists on the remote it is adopted (checked out tracking the remote); otherwise it is created locally as an orphan.

### Sync & Conflict Resolution

Sync:
A user-initiated operation that commits all local ticket changes, fetches the remote ticket branch, rebases local on remote, and pushes. Triggered via the Sync button on the board toolbar. Hidden when no remote tracking branch is configured.
Avoid: push, pull, upload, download

Conflict Resolution:
The process of resolving git merge conflicts that arise during a Sync rebase. The app offers to launch Claude via a Coding Agent Profile with a user-configurable plain-text prompt. Claude resolves conflict markers, completes the rebase, and pushes.
Avoid: merge, fix conflicts

Sync Pending:
A cached per-worktree flag indicating whether the local worktree has uncommitted changes or differs from upstream. Shown as a yellow dot on the sync button.
Avoid: dirty state, needs sync

### Agent Launcher

Agent Launcher:
A tab inside the Ticket Detail Dialog that assembles a prompt from a Template and checked Skills, then launches Claude Code in a separate terminal window using the selected Coding Agent Profile. The user interacts with Claude directly in the terminal.
Avoid: AI console, terminal, shell, CLI

Coding Agent Profile:
A named command string that controls how Claude is launched from the Agent Launcher. Contains a name and a command. The server executes the command with parameters appended (initialPrompt, ticketTitle). The app ships default profiles for Windows and macOS backed by user-editable platform scripts in `~/.context-launch/config/`.
Avoid: claude config, claude instance, agent config

Template:
A named prompt string with placeholders (e.g. `{{ticketDir}}`, `{{ticketTitle}}`). One template is selected as the base prompt in the Agent Launcher. Interpolated after skill text is appended.
Avoid: prompt, instruction

Skill:
A named template string that appends to the base Template when checked in the Agent Launcher. Uses the same placeholder syntax as Templates.
Avoid: addon, plugin, extension

Shortcut:
A named command that launches an external application against a ticket's context. Has a name and a command string with Placeholders. Unlike the Agent Launcher, no prompt assembly occurs -- the command runs directly. Configured in Launcher Config at app or project scope.
Avoid: app, tool, quick launch

Placeholder:
A `{{variable}}` reference in a Template, Skill, or Shortcut that gets replaced with a runtime value at launch time. Available: `{{ticketDir}}`, `{{ticketSlug}}`, `{{ticketTitle}}`, `{{ticketNumber}}`, `{{ticketStatus}}`, `{{projectPath}}`, `{{projectSlug}}`, `{{skills}}`, `{{launchDir}}`.

Agent Marker:
A JSON file written by the launch script while an agent is running, containing the wrapper shell PID and start time. Used to detect whether an agent is already running for a ticket and to detect stale markers from crashed processes.
Avoid: lock file, pid file

Branch Prefix:
An optional string prepended to agent worktree branch names (e.g. `agent/` yields `agent/fix-login`). Configured in Launcher Config.
Avoid: namespace, prefix

Launcher Config:
A JSON file defining available Templates, Skills, Coding Agent Profiles, and launcher settings. Exists at two scopes: app-level (`~/.context-launch/config/launcher-config.json`) and project-level (`~/.context-launch/projects/{projectSlug}/config/launcher-config.json`). Project-level merges additively with app-level; project wins on name collision.
Avoid: agent config, prompt config

Settings:
The dialog for managing Launcher Config entries (Templates, Skills, Coding Agent Profiles) and launcher settings like the worktree root path. Accessible from the board UI.
Avoid: launcher settings, preferences

Agent Worktree:
A git worktree created from the project's main branch for an agent to work in isolation. Located under a user-configured worktree root path (defaults to `~/.context-launch/projects/{projectSlug}/worktrees/`). Branch named `{folderName}`, or `{branchPrefix}/{folderName}` when a branch prefix is configured. Reused across runs.
Avoid: sandbox, workspace

## Relationships

- A Project has exactly one Worktree (created automatically on first board load)
- A Worktree is checked out from the Project's Orphan Branch
- A Worktree contains zero or more Ticket Folders
- A Ticket Folder contains exactly one `status.json` and zero or more Context documents
- A Board Definition defines the set of Columns available to a Project
- A Column has a name and an optional description
- A Context name is chosen freely; by convention it often mirrors a Column name (e.g. `review.md`) but the two are not linked
- A Column name is auto-slugified into a Column Slug and must be unique within its Board Definition
- The reserved name "undefined" cannot be used for a Column
- When a Column is renamed, ticket statuses and column defaults may be migrated (scoped to all projects, current project, or none)
- When a Column is deleted, affected tickets appear in the Undefined Column
- The Agent Launcher assembles a prompt from a Template and zero or more Skills
- A Launcher Config exists at app scope and optionally at project scope; project merges into app
- A Launcher Config contains zero or more Shortcuts
- An Agent Worktree branches from the Project's main branch, named `{folderName}` (optionally prefixed with a configurable branch prefix)
- The Agent Launcher remembers the last-used Template, checked Skills, and Coding Agent Profile per Column
- A Ticket may depend on zero or more Tickets (a Dependency); the graph is acyclic
- A Ticket may be a member of at most one Group; Groups nest acyclically
- Editing a Ticket Number rewrites inbound Dependency and Group membership entries; deleting a ticket removes them; entries pointing at absent tickets are ignored when rendering

## Disk layout

Config files live under `~/.context-launch/config/`: the Project Registry, app-level Launcher Config, Board Definitions (`boards.json`), and platform scripts. This directory is designed to be shared across machines via symlink or sync tool.

Per-project data lives under `~/.context-launch/projects/{projectSlug}/`. Each project gets:
- A `config/` directory with its project-level Launcher Config (local-only, not versioned)
- A `tickets/` directory that is a git Worktree of the Orphan Branch — this stores all Ticket Folders
- A `worktrees/` directory (by default) for Agent Worktrees — git checkouts of main/master where agents do their work

The Worktree (`tickets/`) and Agent Worktrees (`worktrees/`) are separate git checkouts: the Worktree holds ticket data on the orphan branch, Agent Worktrees hold real code from main.
