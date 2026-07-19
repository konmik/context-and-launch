# Herdr launch renames the workspace

When starting a Herdr agent, it renames the workspace (space). The existing space is reused (a new agent is spawned into it) and the space itself gets renamed.

## Root cause

Herdr auto-derives the workspace label from the live working directory of its pane. From the Herdr changelog:

- 0.6.2 - "Workspace labels now follow the live pane working directory after directory changes."
- 0.3.0 - "Workspace identity now follows the first tab's root pane again instead of stale creation-time cwd."
- 0.6.5 - "Workspace rename prompts and background notifications now use live cwd-derived workspace labels instead of stale session labels."

`config-defaults/run-agent-herdr.ps1` finds the existing workspace (label matches the Project Slug), then starts a new agent in it with the ticket's Agent Worktree as cwd:

```powershell
$startArgs = @(
    'agent', 'start', $agentName,
    '--cwd', $launchDir,
    '--workspace', $workspaceId,
    '--no-focus', '--'
) + $agentCommand + @($cleanPrompt)
```

Because `$launchDir` (line 98) is the ticket's Agent Worktree, not the Project path, Herdr relabels the workspace to follow that cwd. The space is not abandoned or recreated; Herdr renames it in place.

The workspace is also created with the same worktree cwd (line 54: `workspace create --cwd $launchDir`), which is the underlying issue. ST-0047 reqs 26/100 specify the workspace base directory should be the Project path.

## Fix

herdr has no flag to pin the label; it only auto-updates `label`, never workspace metadata tokens. So we key workspace selection on a persistent metadata token instead of the mutable label.

`run-agent-herdr.ps1`:
- Select the space by matching the `projectSlug` metadata token (`herdr workspace list` -> `tokens.projectSlug -ceq $projectSlug`). The token survives every relabel, so the next agent starts into the same space.
- On create, stamp the token: `herdr workspace report-metadata <id> --source context-launch --token projectSlug=<slug>` (no ttl, persists until the workspace closes). Verified the token round-trips in `workspace list` and survives `workspace rename`.
- Legacy adoption: if no tagged workspace exists, fall back to the old label match once, adopt that workspace, and stamp it. If nothing matches, create + stamp. Self-healing.

Shell test coverage in `src/core/launcher/run-agent-herdr.shell.test.ts` (create/reuse-after-rename/legacy-adopt). Run with `npm run test:shell`.

## Related

- Herdr UI shows the workspace label for agent rows (github.com/ogulcancelik/herdr/issues/145), so a mislabeled workspace also mislabels agents in the panel.

## Sources

- https://github.com/ogulcancelik/herdr/blob/master/CHANGELOG.md
- https://herdr.dev/docs/cli-reference/
- https://github.com/ogulcancelik/herdr/issues/145
