# Rewrite frontend and backend in SvelteKit

Replace the Kotlin Multiplatform stack (Ktor server + Compose for Web WASM frontend) with a single SvelteKit application running on Node.js via adapter-node, served on localhost.

## Context

The current stack uses Kotlin Multiplatform with a Ktor backend (JVM), a Compose for Web frontend (WASM), and a shared KMP module for DTOs. While functional, the WASM toolchain is slow, the Compose for Web ecosystem is immature, and the multi-module Gradle build adds friction for a small local-first tool.

## Decision

Rewrite the entire application as a SvelteKit project with the following stack:

- SvelteKit with adapter-node on Node.js runtime, standalone localhost server (no Tauri/Electron wrapper)
- shadcn-svelte (with Tailwind) for UI components
- PaneForge for resizable panels with localStorage persistence
- sveltednd for drag-and-drop (kanban column reordering)
- Carta for markdown editing with syntax highlighting
- chokidar for file watching (replaces Java WatchService)
- child_process.exec for git operations (replaces JVM ProcessBuilder)
- showDirectoryPicker() browser API for folder selection, text input fallback
- Vitest for server-side tests
- SvelteKit load functions and form actions as primary data layer, +server.ts routes only for client-side fetches (drag-and-drop updates)

The SvelteKit app is a drop-in replacement: same ~/.ai-stages/ directory layout, same config files, same git orphan branch storage. No data migration needed.

The Kotlin project is replaced entirely. Git history preserves the old code.

## Considered options

- Rewrite frontend only, keep Ktor backend. Rejected: still requires JVM, Gradle, and a separate shared module. The backend logic (file I/O, git commands, JSON config) is simple enough that Node.js handles it without a dedicated backend framework.
- SvelteKit inside Tauri. Rejected: adds Rust dependency, requires SPA mode (no SSR), produces a native binary instead of a browser tab. The current app already runs as localhost + browser, and that model works well for a dev tool.
- SvelteKit inside Electron. Rejected: 150MB+ bundle for a lightweight local tool. Tauri is the modern alternative, and even Tauri was rejected as unnecessary.
- Keep Kotlin stack, improve incrementally. Rejected: Compose for Web ecosystem and WASM tooling are the bottlenecks, not individual features.
