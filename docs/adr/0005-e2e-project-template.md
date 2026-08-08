---
status: accepted
---

# E2e Project Template

E2e projects are created by copying a pre-built git template instead of running the full 12-spawn git ceremony (init, config, commit, bare remote, pushes, orphan worktree) per project. The template is built once per temp directory by the first test that needs it (exclusive-create with a ready marker), then `fs.cpSync`'d per project with two fix-up spawns: `git worktree repair` for the copied tickets worktree and `git remote set-url` (or `git remote remove` for projects without a remote).

The ceremony was the dominant per-test cost: 12 sequential git spawns at 50-300ms each (Windows process spawn plus antivirus variance) put every project-creating test over the 3s isolation budget. A copy costs ~200ms and the observable state is identical: same commits, same upstream tracking, same worktree layout.

Shapes that must stay ceremony-based fall back to the legacy path: `seedRemoteBaseline: true` (the remote must start without the tickets branch). Projects created without a tickets worktree get the template's stale worktree registration removed so the app can create its own worktree on first load.
