# Product requirements: real-time queued Git diff review

## Document status

- Ticket: `st-0062-realtime-queue-git-diff-review`
- Product: Context & Launch
- Status: Product behavior agreed; ready for implementation planning
- Last updated: 2026-08-11
- Supporting decisions: [prototype-decision.md](./prototype-decision.md)
- Supporting research: [research-herdr-agent-stop.md](./research-herdr-agent-stop.md)

## Summary

Add a Ticket-scoped, full-screen Diff Review where a user can inspect every changed file in one continuous GitHub-style diff, navigate through a hierarchical file tree, see new changes as an Agent makes them, track which changes have entered the viewport, select exact lines, and enqueue line-specific Review Prompts for the Ticket's Herdr Agent.

Diff Review supports two deliberate ways of working:

1. **Live Review** watches the active Agent Worktree and updates the displayed diff as files change.
2. **Step-by-Step Review** does not watch files. Its displayed diff changes only when the user explicitly requests Refresh.

Review Prompts enter a persistent FIFO queue immediately. The queue delivers its oldest prompt when a Herdr Agent exists for the Ticket and Herdr reports it as `idle` or `done`. This is knowingly a best-effort gate: current Herdr status detection can report a false idle state while background work is still active. That limitation must not block release, but the delivery gate must remain replaceable.

## Problem

Today, reviewing Agent work requires leaving the Ticket workflow, opening another Git tool, locating the relevant change, and translating the finding back into a prompt. That breaks context and makes it difficult to review work while it is still changing.

The user needs to:

- discover that a Ticket has reviewable work without continuously monitoring every worktree;
- understand the complete change set at file and line level;
- choose between continuously following changes and reviewing explicit snapshots;
- know which changed lines have already been visible;
- give the Agent feedback tied to an exact code snapshot;
- continue reviewing and composing feedback while the Agent is busy;
- trust that feedback is delivered in order and remains visible when delivery cannot proceed.

## Goals

1. Make Agent Worktree changes reviewable without leaving Context & Launch.
2. Preserve the user's attention by distinguishing unseen changes from changes that have already entered the viewport.
3. Support both real-time and explicit-refresh review without hidden refresh behavior.
4. Turn a selected code range and written feedback into an immutable, self-contained Review Prompt.
5. Allow users to keep reviewing while prompts wait for the Agent.
6. Deliver queued prompts in order through the existing Herdr integration.
7. Preserve review and queue state across navigation and app restarts.
8. Follow the repository's existing UI, persistence, command-template, error-handling, accessibility, and testing standards.

## Non-goals

This release will not:

- edit, stage, unstage, discard, commit, or resolve changes;
- add inline discussion threads or a comment history;
- support disconnected or cross-file Review Selections in one Review Prompt;
- allow queue reordering, editing, cancellation, or removal;
- keep a history of successfully delivered Review Prompts;
- bind queued prompts to a particular Agent process or transfer prompts between Agent instances;
- provide Review Prompt delivery to Direct Terminal profiles;
- claim that Herdr `idle` or `done` proves all child, subagent, or background work has stopped;
- require Herdr 0.7.5 or wait for a new authoritative Herdr completion signal;
- continuously monitor all Ticket worktrees while Diff Review is closed;
- truncate large text diffs or treat binary files as line-reviewable text.

## Product vocabulary

The requirements use the codebase's established domain language:

- **Diff Review**: the Ticket-scoped full-screen review surface.
- **File Tree**: the hierarchical, repository-relative directory and file navigation for the current Diff Scope.
- **Continuous Diff**: one vertically scrollable document containing the diff section for every changed file in the current Diff Scope.
- **Diff Scope**: Working Changes, Branch Changes, or Last Commit Changes.
- **Review Pace**: Live Review or Step-by-Step Review.
- **Review Hunk**: a contiguous group of changed lines with independently tracked review state.
- **Review State**: the durable record of reviewed Review Hunks for one Ticket's Agent Worktree.
- **Review Selection**: one contiguous selectable line range in one file.
- **Stale Review Selection**: a selection whose referenced content has changed since selection.
- **Review Prompt**: immutable line-specific feedback and its selected-code snapshot.
- **Review Prompt Queue**: the Ticket-scoped FIFO of prompts waiting for, undergoing, or briefly confirming delivery.
- **Refresh**: an explicit reread from Git for the current Diff Scope; it is not an advance or approval action.

## Primary user journey

1. The app finishes showing its primary interface and checks Ticket worktrees for Diff Review availability and changes.
2. A Ticket with an Agent Worktree exposes the Diff Review action.
3. The user opens Diff Review and chooses a Diff Scope and Review Pace.
4. The user scrolls the Continuous Diff or uses the File Tree to jump to a changed file.
5. Changed lines count as reviewed as they enter the viewport. In Live Review, lines changed while already visible briefly blink and count as reviewed.
6. The user selects a contiguous range of diff lines.
7. A focused composer opens. The user writes feedback and submits it.
8. The app immediately snapshots the selection and appends a Review Prompt to the Ticket's queue.
9. The user continues reviewing while the queue waits.
10. When a Herdr Agent exists and its current reported status is `idle` or `done`, the queue delivers its head prompt.
11. On success, the queue item shows Sent for two seconds and disappears. After a three-second post-delivery cooldown, the next waiting prompt may be delivered if the Agent is currently free.
12. On failure, the head item stays in place with an error icon and Retry action, and later prompts remain blocked.

## Experience requirements

### PR-1: Ticket discovery and entry

1. A Ticket exposes a Diff Review action once it has an Agent Worktree.
2. The action must not require a continuously running file watcher for every worktree.
3. The app must perform its first worktree/change eligibility check immediately after the main interface has been shown.
4. While the app is running, it must repeat the eligibility/change check every 30 seconds.
5. Opening Diff Review must show the currently selected Diff Scope or a clear empty state when that scope has no changes.
6. A Ticket without an Agent Worktree must not open a nonfunctional Diff Review.

### PR-2: Review Workbench layout

1. Diff Review must be a focused, full-screen surface consistent with the application's other immersive views.
2. The chosen Review Workbench direction must provide:
   - a stable, hierarchical File Tree on the left;
   - one Continuous Diff containing every changed file in the selected Diff Scope;
   - visible Diff Scope controls;
   - visible Live Review, Step-by-Step Review, and Refresh controls;
   - line selection with a focused feedback composer;
   - a bottom-docked Review Prompt Queue when that queue is nonempty.
3. The File Tree must group changed files by their repository-relative directory hierarchy rather than present them as a flat list, and directory nodes must be independently expandable and collapsible.
4. Selecting a file in the File Tree must scroll the Continuous Diff to that file's section without hiding other file sections or creating a separate file-level scroll view.
5. Selecting a file must not unexpectedly reorder or collapse the surrounding File Tree.
6. File-level and line-level presentation must make unseen or newly changed work discoverable without requiring manual acknowledgments.

### PR-3: Diff Scopes

Diff Review must support exactly these scopes:

| Diff Scope | Required content |
| --- | --- |
| Working Changes | Staged, unstaged, and untracked changes relative to the Agent Worktree's current `HEAD`. |
| Branch Changes | Changes since the merge-base of the Agent Worktree branch and the Project's configured main branch, plus current Working Changes. |
| Last Commit Changes | Changes introduced by the current `HEAD` commit only, excluding Working Changes. |

Additional requirements:

1. Changing Diff Scope must update the file tree and displayed diff to that scope.
2. Review State for an unchanged Review Hunk must follow that hunk across scopes.
3. A scope calculation failure must be shown explicitly; the product must not silently substitute another scope.
4. Untracked text files in Working Changes and Branch Changes must be represented as added content.
5. Missing history, a missing configured main branch, or an unavailable merge-base must produce a clear empty or error state appropriate to the cause.

### PR-4: Review Paces and Refresh

#### Live Review

1. While Diff Review is open in Live Review, the app must monitor only that Ticket's active Agent Worktree.
2. Relevant file changes must cause the active Diff Scope to update as soon as practical.
3. New or modified files and hunks must be reflected in both the file tree and displayed diff.
4. A line that changes while visible must briefly blink its background to draw attention.
5. A changed line that is offscreen must remain unreviewed until it enters the viewport.

#### Step-by-Step Review

1. Step-by-Step Review must not run a file monitor for diff updates.
2. File changes must not implicitly alter the displayed diff.
3. Refresh must be the only action that changes the displayed diff while Step-by-Step Review remains active.
4. Refresh must reread the selected Diff Scope directly from Git.
5. Refresh must not advance through commits, mark changes approved, or otherwise change the semantic scope.
6. Refresh must preserve Review State for unchanged Review Hunks and treat changed or replacement hunks as new review work.
7. Entering Step-by-Step Review freezes the displayed Git state, not the Review Prompt Queue. Queue delivery continues normally.

### PR-5: Diff rendering and file navigation

1. The File Tree must show every changed file in the selected Diff Scope, grouped under expandable and collapsible repository-relative directories.
2. The Continuous Diff must render every changed file as a section in one shared vertical scroll container, in the same order used by the File Tree.
3. Each text file's diff section must show added, deleted, and unchanged context lines with old and new line numbers where applicable.
4. File headers, hunk headers, and other structural rows must be visually distinguishable from selectable code rows.
5. Selecting a File Tree entry must navigate to the corresponding file section while preserving the user's ability to continue scrolling directly into adjacent file sections.
6. Binary files must appear in the File Tree and Continuous Diff with useful metadata, but must not render a line diff or allow Review Selections.
7. Very large text diffs must load progressively without truncating the reviewable content or breaking the single continuous scroll model.
8. Progressive rendering must retain full line-selection and Review State behavior for the content once loaded.
9. Rendering must remain responsive enough to navigate the File Tree, scroll across file boundaries, change scope, and compose feedback while additional diff content loads.
10. The implementation may build on the prototype-validated `@pierre/diffs` renderer, but library choice must not weaken these product behaviors or codebase standards.

### PR-6: Review State

1. Review State is tracked at Review Hunk level for one Ticket's Agent Worktree.
2. A Review Hunk becomes reviewed when every changed line in that hunk has entered the viewport at least once.
3. Rapid scrolling counts: a changed line does not need to remain visible for a dwell period.
4. A changed line added or modified while already visible counts as having entered the viewport and must also receive the brief background blink.
5. Newly changed offscreen lines are unreviewed.
6. A content change that alters a previously reviewed Review Hunk must create new review work for the affected content.
7. Unchanged Review Hunks retain Review State after:
   - a Refresh;
   - a Diff Scope change;
   - closing and reopening Diff Review;
   - an app restart.
8. Review State is not a user approval, merge approval, or quality judgment. It records visibility only.
9. The initial release must not require the user to click a manual “mark reviewed” control.

### PR-7: Review Selection and composer

1. A Review Selection must be one contiguous range within one file.
2. Added, deleted, and unchanged context lines may be selected.
3. Structural rows such as file and hunk headers must not be selectable.
4. Disconnected ranges or ranges in different files must become separate Review Prompts.
5. Creating a Review Selection must open the feedback composer with its input focused.
6. The composer must support multiline feedback.
7. Enter inserts a newline.
8. Ctrl+Enter on Windows/Linux and Cmd+Enter on macOS enqueue the Review Prompt.
9. A visible Send action must perform the same enqueue operation.
10. Escape closes the composer and discards the unsent feedback without confirmation.
11. If any underlying selected content changes while the composer is open, a stale warning must appear directly beneath the prompt input.
12. A stale warning must not close the composer or prevent submission.
13. A Review Prompt must not be enqueued with an empty feedback body.
14. While a Review Selection exists, its Review Prompt must be draggable out of the app, both from the selected lines and from a handle in the composer.
15. The composer handle must also copy the same text to the clipboard when activated, so the prompt is reachable without a pointer.
16. Dragged and copied text must be exactly the text the Agent would receive, in every data format the drop target may read.

### PR-8: Immutable Review Prompt payload

Enqueueing must create an immutable snapshot containing:

1. the user's feedback;
2. the repository-relative file path;
3. the applicable old and new line ranges;
4. the selected lines exactly as displayed when submitted;
5. up to three visible diff lines before the selection;
6. up to three visible diff lines after the selection;
7. enough metadata to determine later whether the captured selection has become stale.

The payload must not include the entire Review Hunk or complete diff merely because the selection belongs to it.

If the selected content changes after enqueueing:

1. the queued snapshot and feedback must not be rewritten;
2. the original snapshot must still be delivered;
3. the delivered prompt must include a stale-context note for the Agent.

### PR-9: Review Prompt Queue presentation

1. The queue is scoped to one Ticket.
2. Submitting a Review Prompt appends it to the queue immediately, regardless of Agent existence or readiness.
3. The queue sheet must be docked to the bottom of Diff Review.
4. The sheet must be absent when the queue is empty.
5. It must grow upward to display up to three items without internal scrolling.
6. At four or more items, the queue body must scroll internally and remain anchored on the oldest, next-to-send item.
7. Items must appear in FIFO order and expose enough of their feedback/context to distinguish them.
8. The initial release must not offer edit, remove, cancel, or reorder controls for waiting items.
9. Closing Diff Review must not pause or remove the queue.
10. Reopening Diff Review must show the queue's current state.

### PR-10: Delivery eligibility and ordering

1. Only Herdr-backed Tickets can deliver Review Prompts.
2. Diff Review may still display diffs for a Direct Terminal profile, but it must not pretend that Review Prompt delivery is available.
3. The queue must check only:
   - whether a Herdr Agent currently exists for the Ticket; and
   - that Agent's current Herdr lifecycle status.
4. The queue must not identify or bind to a specific Agent instance.
5. The head prompt is eligible for delivery when an Agent exists and Herdr currently reports `idle` or `done`.
6. `idle` and `done` are equivalent delivery-eligible states. The seen/unseen distinction must not affect queue behavior.
7. `working`, `unknown`, absence of an Agent, and integration errors are not delivery-eligible states.
8. A non-eligible head item remains waiting. This condition is not itself a delivery failure.
9. Only the head item may be delivered; later items must never bypass it.
10. At most one Review Prompt may be in delivery at a time for a Ticket.
11. Queue delivery must reuse the application's existing five-second Herdr Agent status poll rather than create another Agent-status monitor.
12. Delivery does not require observing a `busy`-to-`free` transition.
13. After a successful delivery, the queue must wait three seconds before considering the next prompt.
14. When the three-second cooldown ends:
    - deliver the next prompt immediately if the currently known status is `idle` or `done`; or
    - leave it waiting until a later status poll reports an eligible state.
15. Queue processing continues while the app is running even if the user navigates away from Diff Review.

### PR-11: Herdr command delivery

1. The feature must ship with the currently supported Herdr 0.7.4 line; Herdr 0.7.5 is not a prerequisite.
2. Delivery must use an editable, application-owned Command Template.
3. The default template is:

   ```text
   herdr pane run {{paneId}} {{prompt}}
   ```

4. The template must expose `paneId` and `prompt` placeholders.
5. Delivery must use the codebase's existing typed Command Template catalog, validation, safe interpolation, override, execution, and error-reporting mechanisms.
6. The submission operation must atomically place the complete prompt into the target pane and submit it.
7. The delivery gate must be isolated behind a replaceable boundary so a future authoritative Herdr completion signal can replace the `idle`/`done` heuristic without changing Diff Review or queue semantics.

### PR-12: Delivery success, failure, and Retry

#### Success

1. A successfully delivered item must show a Sent state for two seconds.
2. After two seconds, that item must leave the queue.
3. Successfully delivered items must not be retained as queue history.
4. The three-second delivery cooldown is independent of the two-second Sent presentation.

#### Failure

1. A failed head item must remain at the head of the queue.
2. It must display an error icon and Retry action in the queue item.
3. A separate failure toast is not required.
4. Later prompts must remain blocked behind the failed head item.
5. An errored item must not retry automatically.
6. Retry must return the item to a waiting state.
7. A retried item must again wait for an existing Agent with `idle` or `done` status before delivery.

### PR-13: Persistence and lifecycle

1. Review State must persist per Ticket and Agent Worktree across app restarts.
2. Waiting and errored Review Prompts must persist per Ticket across app restarts.
3. After restart:
   - waiting prompts resume normal eligibility checks;
   - errored prompts remain errored until the user chooses Retry;
   - sent presentation state need not become permanent history.
4. Queue persistence must preserve FIFO order and immutable snapshots.
5. Removing the Agent Worktree must permanently remove its Review State and the Ticket's Review Prompt Queue.
6. Removing the Ticket must permanently remove its Review State and Review Prompt Queue.
7. Normal navigation, closing Diff Review, scope changes, Review Pace changes, and app restarts must not otherwise clear these records.

## Queue state model

| State | Meaning | Exit |
| --- | --- | --- |
| Waiting | Prompt is persisted at its FIFO position and is waiting for an eligible Herdr Agent or cooldown completion. | Eligible delivery starts. |
| Delivering | The head prompt is being submitted atomically through the configured Command Template. | Success becomes Sent; execution failure becomes Error. |
| Sent | Delivery succeeded and is being confirmed in the UI for two seconds. | Item is removed from the queue. |
| Error | Delivery failed; the head remains and blocks later items. | User selects Retry, returning it to Waiting. |

Agent absence, `working`, `unknown`, or a pending cooldown leaves the item in Waiting; these are not separate error states.

## Review Pace state model

| Event | Live Review | Step-by-Step Review |
| --- | --- | --- |
| Agent Worktree file changes | File monitor refreshes the affected diff as soon as practical. | Display does not change. |
| Visible line changes | Line blinks and counts as viewed. | Not applicable until Refresh exposes the change. |
| Offscreen line changes | New line remains unreviewed until visible. | Not applicable until Refresh exposes the change. |
| User selects Refresh | Rereads current Git state. | Rereads current Git state; the only way to update the displayed diff. |
| User changes Diff Scope | Recalculates the chosen scope and continues watching. | Recalculates once, then remains frozen again. |
| Review Prompt Queue activity | Continues independently. | Continues independently. |

## Empty, loading, and error states

The experience must distinguish at least:

- no Agent Worktree yet;
- Agent Worktree exists but selected Diff Scope has no changes;
- diff calculation in progress;
- large diff progressively loading;
- binary file selected;
- Git scope cannot be calculated;
- Agent does not exist yet, so queue head is waiting;
- Agent exists but is not currently delivery-eligible;
- Direct Terminal profile cannot accept Review Prompts;
- prompt delivery failed and can be retried.

Waiting for an Agent must not be presented as an error. A Git or delivery error must provide actionable, local context without removing the user's queue or review progress.

## Non-functional requirements

### Responsiveness and resource use

1. The main application interface must not be blocked by the initial eligibility check.
2. Closed Diff Reviews must use the 30-second discovery poll, not file monitors for every worktree.
3. Only an open Live Review may attach a file monitor to its Agent Worktree.
4. Switching to Step-by-Step Review or closing Diff Review must release that monitor.
5. Bursts of file-system events must be coalesced sufficiently to avoid redundant Git work and visual thrashing while still updating as soon as practical.
6. Large diffs must not freeze primary navigation or feedback composition.

### Durability and consistency

1. Queue and Review State writes must be resilient to app restart.
2. A restart must not duplicate a persisted queue item.
3. FIFO ordering and head-of-line blocking must remain deterministic.
4. Refresh and live reconciliation must never silently apply Review State from changed content to unrelated content.

### Safety

1. File paths and prompt text must be passed through the established safe Command Template interpolation path.
2. User-authored prompt text must not be concatenated into an ad hoc shell command.
3. The feature must not mutate repository files or Git state.
4. The UI must not describe Herdr `idle` or `done` as Confirmed Turn Completion.

### Accessibility and platform consistency

1. Scope, pace, refresh, file, selection, send, error, and Retry controls must follow existing keyboard, focus, semantics, contrast, and tooltip standards.
2. The queue and stale-selection warning must not rely on color alone.
3. The changed-line blink must remain brief, must not be the sole indicator of new work, and must respect the codebase's reduced-motion conventions.
4. Keyboard submission must use Ctrl+Enter on Windows/Linux and Cmd+Enter on macOS.

### Testability

The implementation must follow existing codebase standards and include automated coverage at the appropriate boundaries for:

- Git scope calculation, including staged, unstaged, untracked, branch, and last-commit cases;
- diff reconciliation and Review Hunk identity;
- hierarchical File Tree navigation and the all-file Continuous Diff;
- viewport-driven Review State;
- Live Review versus Step-by-Step Review behavior;
- immutable and stale Review Prompt snapshots;
- FIFO ordering, cooldown, head-of-line blocking, Retry, and restart restoration;
- Command Template interpolation and execution errors;
- Ticket and Agent Worktree lifecycle cleanup;
- binary and progressively loaded large diffs;
- keyboard and essential accessibility behavior.

## Known constraint: Herdr false-idle status

Herdr does not currently expose Confirmed Turn Completion for Codex or Claude Code. Its screen-derived status may report `idle` or `done` while child, subagent, or background activity is still running. This release deliberately accepts the possibility that a queued Review Prompt is occasionally submitted during such work.

This is a known integration limitation, not a reason to delay the feature. Product behavior is:

1. use `idle` or `done` as the current best-effort eligibility gate;
2. do not add a busyness-transition requirement;
3. do not infer Agent identity or replacement;
4. retain the queue and report actual command-delivery failures;
5. keep the gate replaceable so a future authoritative Herdr signal can be adopted.

## Acceptance scenarios

### Discovery and review

1. **Given** the application has just rendered, **when** Ticket worktree discovery runs, **then** it runs immediately and does not wait for the first 30-second interval.
2. **Given** a Ticket has an Agent Worktree, **then** the Ticket exposes Diff Review.
3. **Given** Diff Review is closed, **then** that Agent Worktree is not continuously file-watched.
4. **Given** Working Changes includes staged, unstaged, and untracked files, **when** selected, **then** all three kinds appear.
5. **Given** Branch Changes is selected, **then** the diff begins at the configured-main merge-base and includes current Working Changes.
6. **Given** Last Commit Changes is selected, **then** current Working Changes do not appear.
6a. **Given** changed files in nested directories, **then** the File Tree represents their repository-relative directory hierarchy and allows directory nodes to be expanded and collapsed.
6b. **Given** multiple changed files, **then** all file sections appear in one Continuous Diff and scrolling can cross directly from one file section into the next.
6c. **Given** a file in the File Tree, **when** the user selects it, **then** the Continuous Diff scrolls to that file without hiding the other file sections.

### Review Pace and state

7. **Given** Live Review is active, **when** a file changes, **then** the file tree and relevant diff update as soon as practical.
8. **Given** a changed line is already visible during a live update, **then** it briefly blinks and counts as viewed.
9. **Given** a changed line is offscreen during a live update, **then** it remains unreviewed until it enters the viewport.
10. **Given** Step-by-Step Review is active, **when** files change, **then** the displayed diff remains unchanged.
11. **Given** Step-by-Step Review is active, **when** Refresh is selected, **then** the current Diff Scope is reread directly from Git without changing scope or advancing history.
12. **Given** a reviewed hunk is unchanged after Refresh or a scope switch, **then** it remains reviewed.
13. **Given** every changed line in a hunk rapidly passes through the viewport, **then** the hunk becomes reviewed without another click.

### Selection and prompt creation

14. **Given** selectable rows in one file, **when** the user drags across a contiguous range, **then** the focused composer opens for that range.
15. **Given** the composer has focus, **when** Enter is pressed, **then** a newline is inserted.
16. **Given** nonempty feedback, **when** the platform submission shortcut or Send is used, **then** one immutable Review Prompt is appended immediately.
17. **Given** selected content changes while the composer is open, **then** a warning appears beneath the input without closing or blocking it.
18. **Given** queued selected content later changes, **when** delivered, **then** the Agent receives the original snapshot with a stale-context note.
19. **Given** the composer is open, **when** Escape is pressed, **then** it closes and discards the unsent feedback without confirmation.
19a. **Given** a Review Selection, **when** the user drags the selected lines or the composer handle into another window, **then** the drop receives the same text the Agent would receive and no leftover diff markup.
19b. **Given** a Review Selection, **when** the composer handle is activated by keyboard or click, **then** that same text is copied to the clipboard.

### Queue and delivery

20. **Given** the Agent is busy or absent, **when** feedback is submitted, **then** it appears immediately in the Ticket queue and remains Waiting.
21. **Given** four queued prompts, **then** the bottom sheet shows a three-item-tall scrolling area anchored on the oldest prompt.
22. **Given** the head prompt is Waiting and the existing status poll reports `idle` or `done`, **then** the head prompt is delivered without waiting for a prior busy state.
23. **Given** a prompt was delivered successfully, **then** it shows Sent for two seconds and the next prompt is not considered until the three-second cooldown ends.
24. **Given** cooldown ends and the current status is still `idle` or `done`, **then** the next prompt is delivered.
25. **Given** cooldown ends while the current status is not eligible, **then** the next prompt remains Waiting until a later poll reports `idle` or `done`.
26. **Given** delivery fails, **then** the head displays an error icon and Retry, stays queued, and blocks later prompts.
27. **Given** an errored head prompt, **when** the user does nothing, **then** it is not retried automatically.
28. **Given** the user selects Retry, **then** the item returns to Waiting and delivers only after normal eligibility is satisfied.
29. **Given** Diff Review is closed while prompts are queued, **then** queue processing continues while the app runs.
30. **Given** the app restarts, **then** waiting prompts resume, errored prompts remain errored, snapshots remain unchanged, and order is preserved.
31. **Given** the final item leaves its Sent state, **then** the empty queue sheet disappears.
32. **Given** the Ticket or its Agent Worktree is removed, **then** its queue and Review State are permanently removed.

### Special files and scale

33. **Given** a changed binary file, **then** it appears with metadata but offers no line selection.
34. **Given** a very large text diff, **then** it loads progressively and remains fully reviewable rather than being truncated.

## Deferred follow-up work

- Queue item cancellation, removal, editing, and reordering.
- Delivered Review Prompt history.
- Direct Terminal prompt delivery.
- Rich discussion threads or resolved/unresolved comment workflows.
- Adoption of a future authoritative Herdr turn-completion signal.
- Any Herdr-specific per-turn identity model.

## Release readiness

The feature is product-ready for implementation planning when:

1. the implementation plan maps every `PR-*` requirement to an owning module or boundary;
2. persistence and lifecycle cleanup have explicit designs;
3. the diff renderer is validated against the all-file Continuous Diff, File Tree navigation, line selection, progressive loading, and viewport observation;
4. the Herdr delivery gate is isolated and uses the existing Command Template path;
5. automated test coverage is planned for all acceptance-scenario groups;
6. no implementation assumes that `idle` or `done` is authoritative completion.
