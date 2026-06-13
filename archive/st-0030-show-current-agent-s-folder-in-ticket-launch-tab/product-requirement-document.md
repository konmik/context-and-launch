## Problem Statement

The Agent Launcher tab has a "Launch in worktree" toggle but never shows the user which directory the agent will work in. The launch directory is resolved server-side at launch time, invisible to the user beforehand. Users cannot confirm or copy the path before launching.

## Solution

Display the resolved launch directory as read-only text below the "Launch in worktree" checkbox in the Ticket Detail Dialog footer. The path wraps naturally (no truncation). A copy-to-clipboard icon button sits beside it. The display updates reactively when the toggle changes:

- useWorktree off: shows the project path
- useWorktree on: shows the agent worktree path (worktreeRootPath + worktreeFolderName(folderName))

No "will be created" indicator when the worktree does not yet exist.

## Implementation Decisions

- Client-side path resolution. The client computes the launch directory as the single source of truth. It imports worktreeFolderName directly (a pure function) to apply the 50-char folder name truncation. When useWorktree is off, the launch dir is the project path. When on, it is worktreeRootPath (from the merged launcher config) joined with worktreeFolderName(folderName).

- Default agent worktree root on the client. The merged launcher config already exposes worktreeRootPath (nullable). When null, the server currently falls back to configPaths.agentWorktreeDir(projectSlug). This default must be exposed to the client by adding a resolved agentWorktreeDir field to MergedLauncherConfigWithMeta, so the client can compute the full path without a round-trip.

- Launch request gains launchDir. The LaunchRequest interface adds a launchDir string field. The useWorktree boolean stays because the server still needs it to decide whether to create the worktree via ensureAgentWorktree. The client-provided launchDir becomes the authoritative worktree target path passed to ensureAgentWorktree, replacing the path that function currently computes internally.

- Three server launch paths updated. launchAgentAction, pullAndRetryLaunch, and the shortcut launch action all currently resolve the launch dir server-side (via resolveLaunchDir or ensureAgentWorktree). All three switch to using the client-provided launchDir. The resolveLaunchDir helper either loses its path-computation responsibility or is removed.

- Prompt preview interpolates launchDir. The prompt preview controller currently interpolates all placeholders except launchDir. The client-computed launch dir is wired into the variable map so the preview renders the launchDir placeholder correctly.

- UI layout. A muted text line below the "Launch in worktree" checkbox. Full path, natural word-wrap. A small copy icon button beside it copies the path to the clipboard.

## Out of Scope

- Making the path clickable to open in a file explorer.
- Allowing the user to edit the launch directory inline.
- Showing whether the worktree already exists on disk.
- Changing how worktree creation or dirty/behind-remote checks work.

## Further Notes

The shortcut launch endpoint currently accepts useWorktree and force as separate parameters (not part of LaunchRequest). It will need a launchDir parameter added in the same style.
