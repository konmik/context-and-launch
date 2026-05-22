# Rewrite frontend in SolidStart

Replace the SvelteKit frontend with a SolidStart application. Server-side modules (TicketStore, WorktreeManager, ProjectRegistry, FileWatcher, git) are kept as-is.

## Context

The SvelteKit rewrite (ADR 0002) replaced the Kotlin Multiplatform stack. The frontend is now being rewritten again in SolidStart to adopt SolidJS's fine-grained reactivity model.

## Decision

Rewrite the frontend as a SolidStart project with the following stack:

- SolidStart with adapter-node, same localhost server model
- @dnd-kit/solid for drag-and-drop (kanban column reordering and cross-column moves)
- solid-codemirror (CodeMirror 6) for markdown editing with syntax highlighting
- @corvu/resizable for resizable panels
- @ark-ui/solid for headless UI primitives (dialog, dropdown, tabs, popover) with its default styling
- Tailwind 4 for utility CSS, completely new visual design
- Server functions ("use server") as primary data layer, API routes only for client-side fetches (drag-and-drop status updates, markdown read/write)
- Vitest for tests

Server-side modules are copied unchanged. Same ~/.ai-stages/ directory layout, same config files, same git orphan branch storage. No data migration needed.

## Considered options

- Keep SvelteKit, incrementally improve. Rejected by project owner.
- SolidJS with a separate backend (Express/Fastify). Rejected: SolidStart provides server functions and API routes, eliminating the need for a separate server process.
- Use Kobalte instead of Ark UI. Rejected: Ark UI is more actively maintained and has broader component coverage.
- Use Milkdown instead of CodeMirror. Rejected: solid-codemirror is closer to the existing code-editing experience and has native SolidJS bindings.
