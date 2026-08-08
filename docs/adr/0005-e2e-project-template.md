---
status: accepted
---

# E2e Project Template

E2e projects are created by copying a pre-built git template instead of running the full 12-spawn git ceremony (init, config, commit, bare remote, pushes, orphan worktree) per project. The template is built once per temp directory by the first test that needs it (exclusive create with a ready marker; a failed or interrupted build removes the base so another worker takes over), then `fs.cpSync`'d per project with one fix-up spawn: `git worktree add` to register the tickets worktree, plus `git remote set-url` (or `git remote remove` for projects without a remote). The copy never carries the template's worktree registration, so projects that need no fixture worktree leave the app free to create its own.

The ceremony was the dominant per-test cost: 12 sequential git spawns at 50-300ms each (Windows process spawn plus antivirus variance) put every project-creating test over the 3s isolation budget. A copy costs ~200ms and the observable state is identical: same commits, same upstream tracking, same worktree layout.

Shapes that must stay ceremony-based fall back to the legacy path: `seedRemoteBaseline: true` (the remote must start without the tickets branch). The template only supports branch `tickets`; passing a custom `branch` throws and points at the legacy path. The template base is versioned in its directory name; bump the version when the template build changes so a stale cached base is never reused.
