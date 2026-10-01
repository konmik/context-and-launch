# Tasks

Users create numbered tasks on the board, cancel drafts, and reopen persisted tasks in the task detail dialog.

## Sub-features

- tasks.create saves a task number and title.
- tasks.cancel discards a draft.
- tasks.regenerate suggests the next number for a prefix.
- tasks.persist survives a page reload and opens from its card.

## How to get to it (user POV)

- On the project board, choose + New Task in the header.
- Click a task card to open its detail dialog.

## Driving it with Playwright

Preconditions:

- Register the scratch project using projects.md and remain on its board.
- No task is numbered VERIFY-0001.

- Open: `await page.getByTestId('project-header-new-task-button').click()`; create-task-number-input appears.
- Fill: `await page.getByTestId('create-task-number-input').fill('VERIFY-0001')` and `await page.getByTestId('create-task-title-input').fill('Verification evidence')`.
- Save: capture inputs, then `await page.getByTestId('create-task-submit').click()`; `page.getByTestId('kanban-board-task-card').filter({ hasText: 'VERIFY-0001' })` becomes visible.
- Persist: read status.json in the created folder under `readTaskWorktree(session, 'verification-tasks')`; require number VERIFY-0001 and title Verification evidence. Copy it into evidenceDir. `await page.reload()` must restore the card.
- Reopen: click that card; task-detail-number-input shows VERIFY-0001. Capture the resulting dialog.
- Cancel: reopen New Task, fill a distinct draft, click create-task-cancel, and wait for the number input to be hidden. Task folder count is unchanged.
- Suggest: after saving VERIFY-0001, reopen New Task, fill create-task-number-input with VERIFY, click create-task-regenerate-button, and wait until the input shows VERIFY-0002. Cancel the draft.

## Gotchas

- Card test IDs are repeated. Scope by task number, not first-card position.
- Folder names derive from number and title; discover the saved folder rather than assuming casing.
- Cancellation and regeneration are separate coverage from a successful submit. Initial prove.ts explicitly skips them.
