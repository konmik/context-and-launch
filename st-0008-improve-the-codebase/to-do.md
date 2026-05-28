Here is the report from `/improve-codebase-architecture` skill:

  ---
  Deepening Opportunities

  1. Merge agent-launch orchestration into a deep Agent Launch module
  
  Files: agent-launch.ts, agent-worktree.ts, API routes run.ts and pull-and-retry.ts

  Problem: The "launch an agent" operation is spread across four files. The API routes contain orchestration logic (check worktree flag, call AgentWorktreeManager, then call launchAgent, handle 409). The seam between agent-worktree and agent-launch leaks:
  callers must know the order of operations, which config fields to check, and how errors map to HTTP codes. The route is doing coordination work that belongs in the implementation.

  Solution: Deepen agent-launch into a single module whose interface is roughly launch(projectPath, slug, folderName, useWorktree) -- it handles worktree setup, prompt assembly, terminal spawning, and duplicate-window checking internally. Routes become thin
  dispatchers.

  Benefits: Locality -- all launch logic in one place. The interface shrinks (callers don't juggle three managers). Tests can exercise the full launch decision tree without HTTP. The pull-and-retry variant becomes a mode flag, not a separate route handler.

  ---
  2. Unify path validation behind TicketStore's seam

  Files: ticket-store.ts (requireContained), launcher-config.ts (requireSafeSlug), stage-reading routes

  Problem: Path containment checks are reimplemented per module. requireContained guards folder names; requireSafeSlug guards slugs; stage name validation lives in getStageMarkdown. Each one is shallow on its own (a few lines), and a new code path that takes
  user input and builds a path could easily skip validation. No locality -- the "is this path safe?" question is answered in three places.

  Solution: Concentrate path validation into TicketStore's existing interface. TicketStore already owns the worktree directory; it should be the single authority on what names are safe. Slug validation stays in ProjectRegistry (it owns slugs). The key change:
  stage names get validated at the same seam as folder names, inside TicketStore, not in the route.

  Benefits: Locality for security-critical logic. Deletion test confirms: removing requireSafeSlug from LauncherConfigManager would just move that check into the module that already does path validation. One place to audit.

  ---
  3. Deepen TicketStore to own the file-watcher commit lifecycle

  Files: ticket-store.ts, file-watcher.ts, actions.ts (loadBoard)

  Problem: Two independent commit triggers can race: FileWatcher debounces external changes into git add -A && git commit, while TicketStore auto-commits after every CRUD operation. Both write to the same worktree with no coordination. The seam between them
  leaks -- loadBoard in actions.ts must wire them together, and callers must understand that the watcher and the store share a directory but not a lock. FileWatcher is shallow (73 lines, thin wrapper around chokidar + git).

  Solution: Make TicketStore own the commit strategy. FileWatcher becomes an implementation detail of TicketStore -- the store decides when to commit, whether that's immediate (after CRUD) or debounced (after external edits). The watcher starts when the store is
   initialized, not when loadBoard happens to call it.

  Benefits: Locality for commit timing. The race between two committers disappears because one module controls both paths. TicketStore's interface doesn't change -- callers still call createTicket() etc. -- but the implementation absorbs the watcher. Tests can
  verify that external file changes and programmatic changes don't conflict.

  ---
  4. Deepen LauncherConfigManager to own prompt assembly and interpolation

  Files: launcher-config.ts, prompt-interpolation.ts, agent-launch.ts (assemblePrompt)

  Problem: Building the final prompt requires three steps across three files: load merged config (LauncherConfigManager), concatenate template + skills (assemblePrompt in agent-launch.ts), interpolate placeholders (interpolatePrompt in prompt-interpolation.ts).
  Both assemblePrompt and interpolatePrompt are shallow -- they're string concatenation and regex replace, each under 5 lines. The real bug surface is the interaction: unknown placeholders pass through silently, skill order affects interpolation, and callers
  must know to call these in sequence.

  Solution: LauncherConfigManager already knows about templates and skills. Give it a method like buildPrompt(templateId, skillIds, variables) that returns the fully assembled, interpolated string. The two shallow helpers get absorbed into its implementation.

  Benefits: Leverage -- callers get a ready-to-use prompt from one call. Locality -- placeholder validation (e.g., warning on unresolved {{vars}}) lives next to the config that defines them. The deletion test confirms: removing interpolatePrompt and
  assemblePrompt concentrates complexity rather than scattering it.
