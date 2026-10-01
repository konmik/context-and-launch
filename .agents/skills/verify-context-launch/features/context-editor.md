# Context editor

Users create, select, edit, save, and delete context files attached to a task through its detail dialog.

## Sub-features

- editor.select switches between attached files.
- editor.create creates a named markdown file.
- editor.save persists its body.
- editor.cancel discards new-file and delete-file dialogs.
- editor.delete removes an attached file after confirmation.

## How to get to it (user POV)

- Click a task card on the board to open its detail dialog and editor.
- Use the file dropdown, new-file button, save button, or trash button in the editor.

## Driving it with Playwright

Preconditions:

- Register the scratch project and create VERIFY-0001 via tasks.md.
- Open its card. Discover its task folder and tasksPath before editing.

- Create: click task-detail-editor-new-file-button, fill task-detail-new-file-name-input with design-notes, and click task-detail-new-file-create. Wait for `.cm-content` to be visible.
- Type/save: `await page.locator('.cm-content').click()`; `await page.keyboard.type('Verification context body')`; capture before clicking task-detail-save-button. Wait with page.waitForFunction until task-detail-save-button is disabled or absent, then read design-notes.md from the task folder; require the exact body and copy it to evidenceDir.
- Select: click task-detail-editor-file-dropdown-trigger; select `page.getByTestId('task-detail-editor-file-dropdown-option').filter({ hasText: 'design-notes.md' })`. The editor shows the saved body. Reload, reopen the card, and select it again to prove persistence.
- Cancel creation: open the new-file dialog and click task-detail-new-file-cancel; wait for task-detail-new-file-name-input to be hidden and require no new file.
- Cancel delete: with design-notes selected, click task-detail-editor-trash-button, then task-detail-delete-file-cancel. The file still exists.
- Delete: open trash again, capture confirmation, click task-detail-delete-file-confirm, and wait for its dialog to close. Read the directory to require design-notes.md is absent; retain before/after listings and UI proof.

## Gotchas

- CodeMirror is contenteditable, not a textbox input. Type through keyboard events, never its internal view dispatch.
- `.cm-content` must be scoped to the editor when another editor is visible.
- Save completion must be established before reading the file. An empty created file is not proof of saved content.
- Delete only scratch files; never treat an app's actual task folder as verification scaffolding.
