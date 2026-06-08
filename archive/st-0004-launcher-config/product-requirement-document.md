# Launcher Config

Customizable prompt assembly for the Agent Launcher, replacing the current hardcoded prompt.

## Templates

A Template is a named prompt string with placeholders. The user selects one as the base prompt in the Agent Launcher.

Available placeholders:
- `{{ticketDir}}` -- full path to the ticket folder in the worktree
- `{{ticketTitle}}` -- from status.json
- `{{ticketNumber}}` -- from status.json (e.g. ST-0004)
- `{{ticketStatus}}` -- current column (e.g. "prd")
- `{{projectPath}}` -- the project's repo path
- `{{projectSlug}}` -- the project slug

## Skills

A Skill is a named template string (same data type as a Template). When checked in the launcher, its text appends to the base Template. The combined string is then interpolated in one pass.

Adding a skill requires two fields: name and template string.

## Config storage

Two scopes, separate files, same JSON shape:
- App-level: `~/.ai-stages/launcher-config.json`
- Project-level: `~/.ai-stages/worktrees/{slug}/launcher-config.json`

File structure:

```json
{
  "templates": [
    {
      "name": "Default",
      "text": "Current ticket files are in {{ticketDir}}. Read the files there for context."
    }
  ],
  "skills": [
    {
      "name": "Simplify branch",
      "text": "/simplify current branch"
    }
  ]
}
```

Merge behavior: additive. The UI shows templates and skills from both scopes. On name collision, project wins.

## Per-column defaults

The launcher remembers the last-used template and checked skills per board column. Stored in the project-level launcher config.

## Worktree toggle

A toggle in the launcher to create a new branch and worktree for the agent to work in isolation.

Visibility: the toggle only appears when a worktree root path is configured in the project-level launcher config.

Branch naming: `ai/{folderName}` (e.g. `ai/st-0004-launcher-config`).

Branches from: `main`, falling back to `master`.

Pre-launch checks:
1. If main/master has uncommitted or untracked changes, show an error and stop.
2. If main/master is behind remote, show a modal: "Main branch is behind remote. Pull latest changes before launching?"
3. If the user confirms and pulling causes conflicts, show an error and stop.

Reuse: if the branch and worktree already exist from a previous run, reuse them.

When disabled or unconfigured, the agent launches in the project directory as before.

## UI

Agent Launcher tab layout (vertical stack, top to bottom):
1. Template dropdown (select base template)
2. Skill checkboxes (check to append)
3. Worktree toggle (when configured)
4. Run button

No prompt preview.

Settings button near the dark mode toggle opens a management screen for templates and skills. One unified list with a scope indicator (app or project) on each item. Scope is chosen at creation time.
