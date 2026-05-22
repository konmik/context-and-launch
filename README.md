# AI Stages

AI orchestration framework that runs AI agents locally using Claude Code and Pi, controlled through a fully customizable kanban board.

## Overview

AI Stages lets you orchestrate AI agent workflows from a local-first kanban interface. Define tasks, assign them to AI agents, and watch them execute — all within your own environment.

Tasks are stored as plain Markdown files in git branches, making them easy to share with team members, review in PRs, and track through standard version control workflows.

## Key Features

- **Local AI agents** — runs Claude Code and Pi on your machine, no cloud orchestration layer
- **Customizable kanban board** — define your own stages, rules, and workflows
- **Git-native collaboration** — tasks live as `.md` files in branches, shareable via push/pull
- **Team-friendly** — multiple team members can work on shared task boards through git

## Tech Stack

- **Kotlin Multiplatform** — shared models and business logic
- **Compose for Web** — desktop browser UI (kanban board)
- **Ktor** — local server

## Project Structure

```
ai-stages/
├── util/        # Pure Kotlin utilities
├── shared/      # KMP: models, DTOs, business logic
├── server/      # Ktor server
└── app/         # Compose for Web UI
```

## Getting Started

```bash
# Run the server
./gradlew :server:run

# Run the web app (opens browser automatically)
./gradlew :app:wasmJsBrowserDevelopmentRun
```

Requires Java 21+.
