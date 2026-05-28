# ST-0014 Readme Update

## Problem Statement

The current README describes a Kotlin Multiplatform / Compose for Web / Ktor tech stack that no longer exists. The project was rewritten in SolidStart with TypeScript and Tailwind CSS. A developer discovering the project sees incorrect information about the stack, wrong build commands, and a project structure that doesn't match reality. Additionally, the launch scripts only exist for Windows (`run.ps1`, `kill-server.ps1`), leaving Linux and macOS users without a one-click way to run the app.

## Solution

Rewrite the README to accurately describe the project, its features, and how to install and run it. Add `run.sh` and `kill-server.sh` scripts for Linux/macOS parity with the existing Windows scripts.

## README Sections

The README should contain these sections in order:

1. Title + one-liner. Mention Claude Code by name. Core pitch: a local kanban board that launches Claude Code agents on your tickets, with context engineering, reducing repetitive work (automatic worktrees and merging, prompt template assembly), and organized git-native ticket storage.

2. Overview. What the tool does and why it exists. Value propositions: context engineering for AI agents, automatic worktree creation and merging, prompt templates that eliminate repetitive prompt pasting, git-native ticket storage. State that it currently supports Claude Code and welcomes contributors to add more agents.

3. How to install and run. Prerequisite: Node.js >= 20. Two paths:
   - For users: clone or download the repo, run `run.ps1` (Windows) or `run.sh` (Linux/macOS). The script handles dependency installation, building, starting a hidden server, and opening the browser in app mode.
   - For contributors: `npm install` then `npm run dev`.
   - To stop the server: `kill-server.ps1` (Windows) or `kill-server.sh` (Linux/macOS).

4. Key features:
   - Local AI agent orchestration via Claude Code
   - Kanban board with customizable columns
   - Git-native ticket storage (tickets as folders on an orphan branch)
   - Agent worktrees (isolated branches for AI to work in)
   - Prompt templates and skill templates for customizable prompt assembly
   - Agent launcher that assembles and runs the final prompt

5. Tech stack: SolidStart, Tailwind CSS. Keep it minimal.

## User Stories

1. As a developer discovering the project, I want the README to accurately describe the tech stack, so that I understand what I'm looking at before cloning.
2. As a developer discovering the project, I want a clear one-liner, so that I can quickly decide if this tool is relevant to me.
3. As a developer discovering the project, I want to understand the key features, so that I know what the tool can do.
4. As a potential user on Windows, I want instructions to run the app with a single script, so that I can try it without learning the build system.
5. As a potential user on Linux or macOS, I want a `run.sh` script equivalent to the Windows `run.ps1`, so that I can run the app the same way.
6. As a potential user on Linux or macOS, I want a `kill-server.sh` script equivalent to `kill-server.ps1`, so that I can stop the background server.
7. As a contributor, I want instructions for the dev workflow (`npm install`, `npm run dev`), so that I can set up a development environment.
8. As a contributor interested in adding support for other AI agents, I want the README to invite contributions, so that I know the project is open to it.
9. As a user, I want to know the only prerequisite is Node.js >= 20, so that I can check before attempting to install.
10. As a user, I want to understand that the app opens in browser app mode (like a desktop app), so that I know what to expect when I run the script.

## Implementation Decisions

README content:
- Remove all references to Kotlin, Compose for Web, Ktor, and the old project structure.
- Remove the project structure section entirely.
- Do not use underscore or bold markdown formatting.
- Keep the README brief and scannable.
- Tech stack lists only SolidStart and Tailwind CSS. No mention of TypeScript, Vinxi, Chokidar, CodeMirror, or other internal dependencies.

`run.sh` (new file):
- Bash equivalent of the existing `run.ps1`. Same behavior: check Node >= 20, run `npm install` if `node_modules` missing, run `vinxi build` if `.output` missing, start server as a background process, open the browser.
- Read port and browser from `~/.ai-stages/config.json` with same defaults (port 14780, Chrome).
- Browser opening: try the configured browser, fall back to `xdg-open` / `open` (macOS).
- No app mode on Linux (Chrome `--app` flag works on Linux too, so use it where Chrome is available).

`kill-server.sh` (new file):
- Bash equivalent of the existing `kill-server.ps1`. Read port from config, find the node process listening on that port, kill it.
- Use `lsof` or `ss` to find the process.

## Testing Decisions

This is primarily a documentation and scripting ticket. No unit tests are needed for the README rewrite.

For `run.sh` and `kill-server.sh`: manual testing on Linux/macOS. These are launch scripts that interact with the OS process model and browser, making them impractical to unit test. Verify:
- Script starts the server and opens the browser on a clean checkout (no `node_modules`, no `.output`)
- Script reuses existing build on subsequent runs
- `kill-server.sh` stops the running server
- Scripts handle missing Node.js gracefully with a clear error message

## Out of Scope

- Automated release pipeline or GitHub releases
- CI/CD for building distributable zips
- README screenshots or animated demos
- Contributing guide or code of conduct
- API documentation
- Changelog

## Further Notes

The existing `run.ps1` and `kill-server.ps1` remain unchanged. The new shell scripts should mirror their behavior for cross-platform parity. Refer to ADR-0006 (zip distribution with browser app mode) for the design rationale behind the launch script approach.
