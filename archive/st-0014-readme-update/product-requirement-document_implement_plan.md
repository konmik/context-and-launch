# ST-0014 Implementation Plan

## Current State

- No README.md exists in the project root (it was apparently deleted or never created for the new stack).
- `run.sh` and `kill-server.sh` already exist and are fully implemented, mirroring their PowerShell counterparts. No new shell scripts need to be created.
- The project is a SolidStart + Tailwind CSS app called "Context & Launch" (package name: `context-launch`).
- There are no ADR docs in the repo (the PRD references ADR-0006 but the `docs/adr/` directory does not exist).

## Scope

This ticket has a single deliverable: create a new `README.md` in the project root.

The shell scripts (`run.sh`, `kill-server.sh`) mentioned in the PRD already exist and match the specified behavior. No changes are needed to them or to the PowerShell scripts.

## Step 1: Create README.md

File: `README.md` (project root)

Create the file with the following sections in order, per the PRD:

### Section 1: Title and one-liner

- Title: `# Context & Launch`
- One-liner paragraph: A local kanban board that launches Claude Code agents on your tickets, with context engineering, reducing repetitive work (automatic worktrees and merging, prompt template assembly), and organized git-native ticket storage.

### Section 2: Overview

- What the tool does and why it exists.
- Value propositions listed as a bulleted list:
  - Context engineering for AI agents
  - Automatic worktree creation and merging
  - Prompt templates that eliminate repetitive prompt pasting
  - Git-native ticket storage
- State that it currently supports Claude Code and welcomes contributors to add more agents.

### Section 3: How to install and run

- Prerequisite: Node.js >= 20
- Two subsections (use `##` headings):
  - For users: clone or download the repo, run `run.ps1` (Windows) or `run.sh` (Linux/macOS). Explain that the script handles dependency installation, building, starting a hidden server, and opening the browser in app mode.
  - For contributors: `npm install` then `npm run dev`.
  - To stop the server: `kill-server.ps1` (Windows) or `kill-server.sh` (Linux/macOS).

### Section 4: Key features

Bulleted list:
- Local AI agent orchestration via Claude Code
- Kanban board with customizable columns
- Git-native ticket storage (tickets as folders on an orphan branch)
- Agent worktrees (isolated branches for AI to work in)
- Prompt templates and skill templates for customizable prompt assembly
- Agent launcher that assembles and runs the final prompt

### Section 5: Tech stack

- SolidStart, Tailwind CSS. One line, keep it minimal.
- Per PRD: do not mention TypeScript, Vinxi, Chokidar, CodeMirror, or other internal dependencies.

### Formatting constraints (from CLAUDE.md and PRD)

- Do not use underscore or bold markdown formatting.
- Keep the README brief and scannable.
- Avoid non-ASCII characters.
- No project structure section.
- No references to Kotlin, Compose for Web, Ktor, or any old stack.

### Acceptance criteria

- README.md exists at the project root.
- Contains exactly the five sections described above, in order.
- No underscore or bold markdown formatting anywhere.
- No references to old stack (Kotlin, Compose, Ktor).
- No project structure section.
- Tech stack mentions only SolidStart and Tailwind CSS.
- Mentions Claude Code by name in the one-liner.
- Mentions both Windows and Linux/macOS scripts.
- Mentions `npm run dev` for contributors.
- States Node.js >= 20 as a prerequisite.
- Invites contributors to add more agent integrations.
- Brief and scannable -- aim for under 80 lines total.

## Validation

After creating the README:

1. Verify the file contains no `_text_` or `**text**` markdown formatting.
2. Verify no mentions of Kotlin, Compose, Ktor.
3. Verify the five sections are present in the correct order.
4. Verify `run.sh`, `kill-server.sh`, `run.ps1`, `kill-server.ps1` are all mentioned.
5. Verify Node.js >= 20 prerequisite is stated.

## Edge Cases

- None significant. This is a documentation-only change with a single new file.

## Files Changed

- `README.md` -- created (new file)

## Files NOT Changed

- `run.ps1` -- already correct, no changes needed
- `kill-server.ps1` -- already correct, no changes needed
- `run.sh` -- already exists and fully implemented, no changes needed
- `kill-server.sh` -- already exists and fully implemented, no changes needed
