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
A named stage in a Board Definition representing a ticket status (e.g. `todo`, `prd`, `in-progress`, `review`, `done`). Has a name (auto-slugified into a Column Slug, filesystem-safe, unique within its board), an optional plain-text description displayed below the column header on the board, and an optional Column Color.
Avoid: lane, swimlane, stage

Column Color:
An optional color assigned to a Column in a Board Definition, chosen from a fixed preset palette in Settings. Displayed on tickets of that status as a Status Swatch.
Avoid: status color, label color

Status Swatch:
A small colored rectangle rendered after the Ticket Number on kanban and Forest View cards, showing the Column Color of the Column matching the ticket's status. Red when the status matches no Column. Absent when the matching Column has no Column Color.
Avoid: status rectangle, color badge, color dot

Herdr Agent Status:
The live state of the Herdr Agent associated with a Ticket, exactly as Herdr reports it: working, blocked, idle, done, or unknown. Herdr's done means idle with a result not yet seen in Herdr, not work completion, so it is rendered as a muted circle-dot rather than a completion check. Each status has its own icon. Shown as an icon after the Status Swatch on kanban and Forest View cards. Absent when the Ticket has no Herdr Agent.
Avoid: agent state, terminal status

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
The saved pan position and zoom of the Forest View, per project per machine. Restored when the Forest View reopens.
Avoid: camera, scroll position

### Appearance

Palette:
A named color scheme family based on a popular editor theme (Catppuccin, Tokyo Night, Dracula, Nord, Gruvbox). Each Palette supplies a complete color set for both Modes. Selected from the app header, per project per machine. A project with no Palette of its own follows the one selected outside a project, on the welcome screen.
Avoid: theme, color scheme, skin

Mode:
The light or dark axis of the app's appearance, orthogonal to Palette. Selected per project per machine, alongside the Palette. Follows the OS preference until the user toggles it explicitly.
Avoid: theme, dark mode

### Windows

Project Window:
An app window showing exactly one Project, addressed by its project page URL. Several Project Windows can be open at once, each on its own Project.
Avoid: tab, instance

Session Restore:
Reopening the Project Windows that were open when the desktop app last quit, each with its saved size and position. Desktop app only. Closing a Project Window removes it from the next restore; the last window to close is kept.

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

Conflict Resolution Reconciliation:
The step that applies a completed Conflict Resolution to the live Worktree and makes the resolved ticket data visible to the Project Window. It is separate from determining whether a conflict exists.
Avoid: conflict finalization, conflict cleanup

Sync Pending:
A cached per-worktree flag indicating whether the local worktree has uncommitted changes or differs from upstream. Shown as a yellow dot on the sync button.
Avoid: dirty state, needs sync

### Agent Launcher

Agent Launcher:
A tab inside the Ticket Detail Dialog that assembles a prompt from a Template and checked Skills, then launches Claude Code in a separate terminal window using the selected Coding Agent Profile. The user interacts with Claude directly in the terminal.
Avoid: AI console, terminal, shell, CLI

Coding Agent Profile:
A named agent command and Launch Target used by the Agent Launcher. Existing profiles use the Direct Terminal target; Herdr profiles run as Herdr Agents.
Avoid: claude config, claude instance, agent config

Launch Target:
The destination in which a Coding Agent Profile starts its agent. The supported targets are Direct Terminal and Herdr.
Avoid: launch mode, launch environment, backend

Template:
A named prompt string with placeholders (e.g. `{{ticketDir}}`, `{{ticketTitle}}`). One template is selected as the base prompt in the Agent Launcher. Interpolated after skill text is appended.
Avoid: prompt, instruction

Command Template:
A fixed, application-owned catalog entry for a trusted, editable platform-shell action used by shipped runtime behavior. Command Templates are global sparse overrides and are not prompt Templates or Project Launcher Config data.
Avoid: Template, profile, shortcut, project command

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

Diff Review:
A Ticket-scoped full-screen surface for inspecting changes in that Ticket's Agent Worktree and sending line-specific feedback to its Agent.
Avoid: project diff, git diff app, change viewer

Review Selection:
A contiguous range of lines within one file selected in a Diff Review as the subject of feedback to an Agent. It is made by dragging the line-number gutter, by selecting or clicking the code itself, and always covers whole lines even when only part of a line is selected. It refers to the content shown when the selection was made. Disconnected ranges or ranges in different files are separate Review Selections.
Avoid: line reference, highlighted lines

Stale Review Selection:
A Review Selection whose referenced content has changed since it was selected. Its feedback editor stays open and warns the user that the underlying lines changed.
Avoid: invalid selection, expired selection

Review Prompt:
Feedback submitted from a Diff Review to the Ticket's Herdr Agent. It carries a Review Selection when the user selected lines, and stands alone when the user prompts the Agent directly from the Diff Review header. With a selection it immutably captures the feedback and the selected content as they existed when submitted, and if that selection later becomes stale, delivery includes the original snapshot and identifies it as stale; without one, the feedback is delivered verbatim. Submitting it adds it immediately to the Review Prompt Queue rather than waiting for the Herdr Agent to be ready, and leaves the feedback editor open so more feedback can follow. It is one-directional: the Agent acts on it and does not answer back through Diff Review. While it carries a Review Selection the user can also take it out of the app, either by dragging the selected lines or by dragging or activating the handle in the feedback editor, which also copies it to the clipboard; the text that leaves is the same text the Agent would receive, in every format the receiving window may read. Direct Terminal profiles do not accept Review Prompts.
Avoid: comment, annotation, message

Review Prompt Queue:
The ordered pending Review Prompts for one Ticket. It delivers one prompt at a time when a Herdr Agent exists for the Ticket and Herdr reports that Agent as idle or done. When the Ticket has no Agent at all, it starts one from the Ticket column's chosen launcher profile with that prompt as the Agent's initial prompt, rather than waiting for the user to start one. It is shown inside the feedback editor, above that editor's own content, and is not visible while the editor is closed. The Herdr Agent Status for the Ticket is shown in the Diff Review header, next to the action that opens the editor without a Review Selection. It survives app restarts and is removed with either the Ticket or its Agent Worktree.
Avoid: comment queue, feedback backlog, batch

Confirmed Turn Completion:
An authoritative signal that a Herdr Agent's current turn and every child, subagent, or background task it started have ended. Herdr Agent Status values such as idle or done do not establish Confirmed Turn Completion.
Avoid: idle, done, ready for input, completely stopped

Diff Scope:
The boundary that determines which Agent Worktree changes a Diff Review shows: All Changes, Branch Changes, Uncommitted Changes, or Last Commit Changes. A Diff Review opens on All Changes, because reviewing an Agent's work means reviewing everything it produced, committed or not.
Avoid: mode, diff mode, change mode

All Changes:
Everything introduced since the merge-base of the Agent Worktree branch and the Project's configured main branch, including Uncommitted Changes. The union of Branch Changes and Uncommitted Changes.
Avoid: everything, full diff

Branch Changes:
The changes committed on the Agent Worktree branch since its merge-base with the Project's configured main branch, excluding Uncommitted Changes.
Avoid: branch mode, committed changes

Uncommitted Changes:
The staged, unstaged, and untracked changes in an Agent Worktree relative to its current `HEAD`.
Avoid: working changes, uncommitted mode, working-tree mode

Last Commit Changes:
The changes introduced by the current `HEAD` commit in an Agent Worktree, excluding Uncommitted Changes.
Avoid: commit mode, latest changes

Review Pace:
The update behavior of a Diff Review: Live Review or Step-by-Step Review.
Avoid: review mode, update mode

Live Review:
A Review Pace that watches the Agent Worktree and updates the displayed diff as file changes occur.
Avoid: real-time mode, unfrozen review

Step-by-Step Review:
A Review Pace that does not watch the Agent Worktree and changes its displayed diff only when the user requests a refresh.
Avoid: frozen mode, paused review

Review Hunk:
A contiguous group of changed lines in a Diff Review. It groups changed lines for counting and navigation; reviewed state is tracked per changed line, not per hunk.
Avoid: change block, diff block, patch

Review State:
The durable record of reviewed changed lines for one Ticket's Agent Worktree. A changed line becomes reviewed once it has entered the viewport at least once; rapid scrolling and live changes already visible both count, while visible live changes briefly blink to draw attention. A file is shown as reviewed once all of its changed lines are, and as not reviewed otherwise; there is no separate state for a file that changed after being reviewed. A line is identified by its own content, so editing one line leaves every other line in the same hunk reviewed. It follows unchanged lines across Diff Scopes, survives closing Diff Review and restarting the app, and is removed with the Agent Worktree.
Avoid: review cache, diff cache

Next Change:
A user action that scrolls the Diff Review to the first changed line that is not reviewed yet, switching files and wrapping around the Diff Scope as needed. Arriving at a line makes it reviewed, so repeated use walks the whole Diff Scope once. Its counter shows how many Review Hunks still hold an unreviewed line.
Avoid: next hunk, next diff, skip

Refresh:
A user action that rebuilds the displayed diff directly from Git for the selected Diff Scope. It preserves Review State for unchanged lines and is the only way the displayed diff changes during Step-by-Step Review.
Avoid: advance, sync, reset review

Herdr Workspace:
A project-level container in Herdr that Context & Launch associates with one Project and uses to host Herdr Agents. It is distinct from an Agent Worktree.
Avoid: Herdr environment, terminal environment

Herdr Ticket Pane:
A persistent pane in a Herdr Workspace associated with one Ticket through its `{projectSlug}--{folderName}` pane label. It retains its identity when its Herdr Agent is replaced.
Avoid: agent panel, agent instance

Herdr Agent:
A coding-agent process hosted by a Herdr Ticket Pane. A later launch replaces the finished or waiting process, and a Herdr Ticket Pane never hosts concurrent Herdr Agents.
Avoid: terminal, pane

Herdr Unavailable:
The state in which Herdr answers nothing because the Herdr CLI is not installed or the Herdr server is not running. Every Herdr command is a call over the Herdr server socket, so both cases mean the same thing: this machine hosts no Herdr Agents right now. Actions that only need to know whether a Herdr Agent exists, such as Ticket cleanup, treat it as "no Herdr Agent" and stay available rather than failing. A missing CLI stops Herdr Agent Status polling, a stopped server does not.
Avoid: Herdr error, Herdr missing

## Relationships

- A Project has exactly one Worktree (created automatically on first board load)
- A Project Window shows exactly one Project; a Project may be shown by more than one Project Window
- A Project Window renders exactly one Palette in exactly one Mode at a time; every Palette defines both Modes
- A Worktree is checked out from the Project's Orphan Branch
- A Worktree contains zero or more Ticket Folders
- A Ticket Folder contains exactly one `status.json` and zero or more Context documents
- A Board Definition defines the set of Columns available to a Project
- A Column has a name, an optional description, and an optional Column Color
- A Context name is chosen freely; by convention it often mirrors a Column name (e.g. `review.md`) but the two are not linked
- A Column name is auto-slugified into a Column Slug and must be unique within its Board Definition
- The reserved name "undefined" cannot be used for a Column
- When a Column is renamed, ticket statuses and column defaults may be migrated (scoped to all projects, current project, or none)
- When a Column is deleted, affected tickets appear in the Undefined Column
- The Agent Launcher assembles a prompt from a Template and zero or more Skills
- A Coding Agent Profile selects exactly one Launch Target
- A Launcher Config exists at app scope and optionally at project scope; project merges into app
- A Launcher Config contains zero or more Shortcuts
- An Agent Worktree branches from the Project's main branch, named `{folderName}` (optionally prefixed with a configurable branch prefix)
- A Project has at most one Herdr Workspace
- A Herdr Workspace contains at most one Herdr Ticket Pane for each Ticket Folder
- A Herdr Ticket Pane hosts at most one Herdr Agent at a time
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
