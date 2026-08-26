# Realtime diff review prototype decision

## Decision

Use Review Workbench, formerly Variant A, as the direction for implementation, with a GitHub-style Continuous Diff instead of a focused single-file diff.

Its stable hierarchical File Tree, all-file Continuous Diff, live/frozen review controls, and line-selection feedback flow provide the clearest foundation.

The File Tree groups changed files under expandable and collapsible repository-relative directory nodes. Selecting a file scrolls the Continuous Diff to that file's section; it does not replace the visible diff or hide the other file sections.

The Continuous Diff renders every changed file in the selected Diff Scope as a section in one vertical scroll container. The user can scroll directly across file boundaries as on GitHub. Progressive rendering for large diffs must preserve this continuous navigation model.

## Review Prompt delivery

Ship Review Prompt queuing for Herdr Agents using Herdr's current lifecycle status as a best-effort delivery gate.

Herdr can report an Agent as idle or done while child, subagent, or background work is still running. This known limitation must not block the feature. Keep the delivery gate isolated so a future authoritative Herdr turn-completion signal can replace the heuristic without changing Diff Review or the Review Prompt Queue.

The queue is one-way and Ticket-scoped. Submitting feedback appends it to the queue; when Herdr reports the Ticket's Agent free, the oldest prompt is delivered. Context & Launch does not bind queued prompts to a particular Agent instance or model Agent replacement and prompt transfer.

The Review Prompt Queue is a sheet docked at the bottom of Diff Review so pending prompts and their delivery state remain visible while the user reviews changes. It grows upward to show as many as three prompts. With more than three prompts, its contents scroll internally and remain anchored on the oldest, next-to-send prompt.

The queue sheet is absent when the queue is empty. It appears with the first item and disappears after the last successfully delivered item's two-second Sent state ends.

The initial release does not allow removing or otherwise managing pending Review Prompts. Queue-management controls are deferred to a later change.

The queue is Ticket-scoped and one-directional. It does not identify or track a particular Herdr Agent instance. The head prompt waits until a Herdr Agent exists for the Ticket and its reported lifecycle status is free, then it is delivered. If no Agent exists or the Agent is not free, the queue remains unchanged.

If delivery fails, the head Review Prompt remains in place and no later prompt advances past it. Its queue item displays an error icon and a Retry button; no separate toast is shown.

An errored head prompt is not retried automatically. Retry explicitly returns it to the waiting state; delivery then waits again for an existing free Herdr Agent.

Closing Diff Review does not pause the Ticket's Review Prompt Queue. It continues waiting and delivering while the app is running, and reopening Diff Review shows its current state.

Pending and errored Review Prompts persist per Ticket across app restarts. Restored waiting prompts resume normal delivery; restored errored prompts remain stopped until Retry.

After successful delivery, a Review Prompt displays a Sent state for two seconds and then leaves the queue. The queue is not a delivery-history view.

A queued Review Prompt is immutable. If its Review Selection changes before delivery, it still sends the original selected-code snapshot and adds a stale-context warning for the Herdr Agent.

A Review Selection is one contiguous line range in one file. Disconnected locations or multiple files are submitted as separate Review Prompts.

Added, deleted, and unchanged context lines may all be selected. File headers, hunk headers, and other structural rows are not selectable.

The Review Prompt composer accepts multiline feedback. Enter inserts a newline; Ctrl+Enter on Windows/Linux and Cmd+Enter on macOS enqueue the prompt. A visible Send action provides the same submission.

Each delivered Review Prompt contains its repository-relative file path, old and new line ranges, the selected lines, and up to three visible diff lines before and after the selection. It does not include the entire hunk or diff.

Escape closes the composer and discards its unsent Review Prompt without confirmation.

Binary files appear in the file tree with metadata but do not render line review or allow Review Selections.

Very large text diffs load progressively while retaining full review and selection capability; they are not truncated.

Removing either the Ticket or its Agent Worktree permanently removes the Ticket's Review Prompt Queue and Review State.

Queue delivery reuses the app's existing five-second Herdr Agent status poll. A free Agent may therefore receive the next prompt up to five seconds after becoming free; the queue does not create a separate status monitor.

After each successful delivery, the queue waits three seconds. When that cooldown ends, it delivers the next prompt if Herdr currently reports the Agent as idle or done; otherwise the prompt continues waiting for a later status check. No busy-to-free transition must be observed.

Review Prompt delivery must ship against the currently supported Herdr version; it does not require Herdr 0.7.5's `agent prompt` command. Herdr 0.7.4's `pane run` provides an atomic bracketed-paste-plus-Enter operation that can deliver the prompt to the Ticket's detected Agent pane.

Review Prompt delivery uses an editable, application-owned Command Template with `paneId` and `prompt` placeholders, defaulting to `herdr pane run {{paneId}} {{prompt}}`. Its implementation follows the existing typed Command Template catalog, safe interpolation, override, execution, and error-reporting standards rather than introducing a separate shell path.

## Prototype archive

The complete three-variant exploration is preserved locally on branch `prototype/st-0062-diff-review-variants` at commit `4eedc28`.
