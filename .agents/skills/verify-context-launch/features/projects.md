# Projects

Users register a local Git project and choose the branch holding its task folders. The app derives the main branch and opens the new project board.

## Sub-features

- projects.register creates a registry entry and task-storage orphan branch/worktree.
- projects.main-branch derives main from a valid project path.
- projects.custom-branch accepts a different task branch name.
- projects.menu-entry opens registration from an existing project's menu.

## How to get to it (user POV)

- Visit /add-project on first setup or directly in the browser.
- From a project, open its project menu and choose Add Project.

## Driving it with Playwright

Preconditions:

- Doctor passes and session.projectPath is the disposable Git project.
- Registry is empty for the registration recipe.

- Open: `await page.goto(session.server.baseUrl + '/add-project')`; add-project-path-input is visible.
- Enter path: `await page.getByTestId('add-project-path-input').fill(session.projectPath)`; wait with page.waitForFunction for add-project-main-branch-input.value to equal main.
- Set branch: `await page.getByTestId('add-project-branch-input').fill('verification-tasks')` for the baseline custom-branch path; separate default-branch verification leaves tasks unchanged.
- Register: capture the form, then `await page.getByTestId('add-project-submit').click()`; wait for project-header-settings-button to be visible.
- Prove: readRegistry(session) has the expected path, mainBranch, and branch. `readTaskWorktree(session, 'verification-tasks')` returns the actual task worktree path and requires it to be inside scratchDir. Run Git branch --list in session.projectPath and Git worktree list --porcelain and copy output to evidenceDir. Reload and require the same project board.
- Menu entry: on that board click project-header-title-menu-trigger, then project-header-add-project-menuitem; add-project-path-input appears. Capture this separately from direct-route coverage.

## Gotchas

- A browser path Browse button is an OS boundary and is deliberately cancelled in this harness. Filling the textbox is the safe registration path.
- The path triggers asynchronous main-branch discovery; do not submit before it settles.
- Multiple boards expose add-project-board-select only when configured. That condition is not covered by the one-board baseline.
- Do not register the checkout being verified: registration writes Git refs and worktrees.
