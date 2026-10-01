# Prompt assembly

Users inspect a task's assembled agent prompt, choose a template, and include skills before deciding whether to launch an agent.

## Sub-features

- launcher.open reaches the launcher from task detail.
- launcher.interpolate expands taskDir rather than showing raw placeholders.
- launcher.skills adds or removes selected skill text.
- launcher.template selects an available template.
- launcher.run is intentionally blocked in this verification baseline.

## How to get to it (user POV)

- Click a task card, then choose the launcher tab in its detail dialog.
- Use the template selector and skill checkboxes next to the prompt preview.

## Driving it with Playwright

Preconditions:

- Register the scratch project and create VERIFY-0001 via tasks.md.
- Harness seeds the Verification template and verification-skill. Profiles and shortcuts are empty.

- Open: click the VERIFY-0001 card, then `await page.getByTestId('task-detail-tab-launcher').click()`; task-detail-launcher-template-select becomes visible.
- Template: `await page.getByTestId('task-detail-launcher-template-select').selectOption('Verification')`; wait until `.cm-content` contains Inspect and the task folder path, with no literal `{{taskDir}}`.
- Skill: `await page.locator('[data-testid="task-detail-launcher-skill-checkbox"][data-skill-name="verification-skill"]').check()`; wait for `.cm-content` to contain Keep all changes inside this scratch project. Capture the checked input and prompt.
- Remove: uncheck the same locator and wait for the skill sentence to disappear. Capture after the change.
- Prove scope: copy the preview text to evidenceDir alongside before/after Git worktree listings. Preview alone must not create an agent worktree. Report actual launch as skipped.

## Gotchas

- Never click task-detail-launcher-run-button in this baseline. Preview proof does not prove terminal delivery or real agent startup.
- Only one template is seeded. Multi-template switching requires adding fixture templates before launch and recording the added precondition.
- Skill selection must be proved both checked and unchecked; seeing text once does not establish removal.
- OS clipboard, terminal, and Herdr delivery are external boundaries and require explicit, separately isolated verification.
