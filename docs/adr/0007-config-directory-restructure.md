# Restructure ~/.context-launch into config/ and projects/ directories

Collapse the flat `~/.context-launch/` layout into two top-level directories: `config/` for app-wide configuration and platform scripts, and `projects/{slug}/` for per-project data (tickets worktree, project config, agent worktrees). Per-project config moves out of the ticket worktree and into its own directory, making it local-only rather than versioned in the orphan branch.

## Considered Options

- Keep flat layout, move only project config out of worktree. Rejected: `~/.context-launch/` was accumulating unrelated files at the root (config, scripts, board configs) with no grouping, making it harder to share config across machines via symlinks.
- Keep per-project config inside the worktree (git-versioned). Rejected: project config is machine-local (worktree root path, column defaults tied to a specific setup). Sharing it via git creates unwanted cross-machine coupling.
