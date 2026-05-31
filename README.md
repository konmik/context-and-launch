# Context & Launch

A local kanban board with context engineering, automatic worktrees, and git ticket storage. Assemble a prompt and launch an AI agent in one click.

## Overview

There is no fixed workflow, no rules and no standard.
Think of this app as a todo+notepad with CLI shortcuts that is especially suited for AI-assisted workflow.
It has a convenient kanban board for all notes, so the developer won't forget where each task is, and can easily pick up from where they left off.

![readme-example.png](.github/readme-example.png)

## Why it exists

Slop-code orchestrators are not capable of creating production code yet, but we still need to automate our chores when adding AI agents to the workflow.

AI-assisted workflow is too fast and too complicated, with context switching all the time.
It requires the developer to constantly wait for the agent's slow operations and to enter the same prompts and git commands over and over.
It is easy to forget to enter a prompt, make a mistake on the command line, skip creating a worktree, or fall asleep while waiting.

**Context & Launch** allows the developer to batch as many operations as possible into a single run, and leave the agent for hours while it is working in the background.
Meanwhile, the developer can start planning the next ticket, review the work of the previous agent, go to a meeting or take a break.

## Key features

- Kanban board with customizable columns
- Each ticket is a folder with markdown, images, and other files
- Integrated markdown editor for files in the ticket folder
- Git-native ticket storage (on an orphan branch), can sync with your team
- Automatic creation of worktrees (isolated branches for AI to work in)
- Prompt templates and skill templates for customizable prompt assembly
- Agent launcher that assembles and runs the prompt
- That's all!

## Integration with AI agents

Currently supports **Claude Code**. Contributors are welcome to add integrations for other agents. Agent launch scripts are part of the app configuration; modify them as you like.

Windows script requires [Windows Terminal](https://learn.microsoft.com/en-us/windows/terminal/install), but if you prefer something else, just ask Claude to modify the script.

**Context & Launch** does NOT provide additional UI on top of existing agents, and this is intentional:
- Anthropic will bill third-party interfaces separately from subscriptions starting 15 June 2026
- The problem of agentic UI is already solved

## Install and run

Prerequisites: Node.js >= 20.

On Windows: [Windows Terminal](https://learn.microsoft.com/en-us/windows/terminal/install).

### For users

Clone or download the repo, then run the launch script:

- Windows: `./run.ps1`
- Linux / macOS: `./run.sh`

The script installs dependencies if needed, builds the app, starts a background server, and opens the browser in app mode.

The server shuts down on its own several minutes after the app is closed, but it can be stopped manually:

- Windows: `./kill-server.ps1`
- Linux / macOS: `./kill-server.sh`

### First-time setup

After you add your project to the app, go to Settings and configure it for your own workflow.

The app comes with a starting set of prompts, skills, and launch commands, but they almost certainly won't match how you work — every developer uses different skills, commands, editors, and optional tooling (Jira, etc.). Treat the built-ins as examples to edit or replace, not as a config you should leave untouched.

Click the gear icon in the top-right header to open Settings, then walk through the tabs.
Most items can be saved at User scope (shared across all projects) or Project scope (only the current project).
Most templates accept placeholders like `{{ticketDir}}`, `{{ticketTitle}}`, `{{projectPath}}` that are filled in at launch time.

You can start adding tickets to the board right away, but expect to spend a few minutes tailoring prompts, skills, and launch commands before the one-click launch really fits your workflow.

### For contributors

```
npm install
npm run dev
```

If you wish to contribute, create an issue first. PRs from unknown contributors will be ignored.
