---
status: accepted
---

# E2e Project Template

E2e Projects are created by copying a pre-built git template instead of running the full 12-spawn git ceremony (init, config, commit, bare remote, pushes, orphan worktree) per Project. Vitest builds the templates in a `globalSetup` before any worker starts and removes them when the run ends, so the fixtures need no cross-worker coordination and no run can inherit a stale template.

The ceremony was the dominant per-test cost: 12 sequential git spawns at 50-300ms each (Windows process spawn plus antivirus variance) put every Project-creating test over the 3s isolation budget. A copy costs about 200ms and the observable state is identical: same commits, same upstream tracking, same worktree layout.

The template is copied per Project with one fix-up spawn: `git remote set-url` to point at that Project's own copy of the remote, or `git remote remove` for a Project without one, plus `git worktree add` to register the tickets Worktree when the Project seeds tickets. The template drops its own worktree registration with `git worktree remove` after pushing, so a copy never carries a registration that points into the template.

`seedRemoteBaseline: true` needs a remote that starts without the Orphan Branch, a shape the template does not hold, so those fixtures run the ceremony per Project.

## Measured effect

Full `npm run test:all` (Windows, 8 forks): 124.7s total, of which the unit projects take 28.8s and the e2e project 57.5s. 131 unit files and 52 e2e files pass.

## What the template hides, and why that is acceptable

Every copied Project carries the Orphan Branch, so `WorktreeManager.ensureTicketsWorktree` always takes its "add a worktree for an existing local branch" path. Its "create a new Orphan Branch" path is covered end to end by the add-project welcome screen test, which points the app at a main-only repo and asserts the app creates the branch. Its "adopt the branch from the remote" path has no e2e cover; a fixture that seeds the branch on the remote but not locally would be needed.
