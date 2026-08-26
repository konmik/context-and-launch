# ST-0058: While logs are loading, do not show "no logs yet"

## Problem Statement

The Application Logs dialog currently uses an empty string as both its initial state and its loaded empty result. While the first log request is still pending, the dialog therefore renders "No logs yet." Users can mistake this transient state for a confirmed absence of application logs.

The dialog needs to distinguish between loading, loaded-with-content, and loaded-without-content states.

## Goal

Ensure the Application Logs dialog communicates that logs are being retrieved until the first request completes. Show "No logs yet." only after a completed request confirms that no log content exists.

## User Stories

1. As a user opening the Application Logs dialog, I want to see a loading state while logs are being retrieved, so that I do not mistake an unfinished request for an empty log file.
2. As a user whose log file is empty, I want to see "No logs yet." after loading completes, so that I know the application has no logs to display.
3. As a user viewing logs while new entries are being collected, I want the existing content to remain visible during background refreshes, so that the dialog does not flicker or hide useful information.
4. As a user clearing the logs, I want the dialog to show the empty state after the clear succeeds, so that the displayed content matches the cleared log file.

## In Scope

- Add an explicit loading state for the initial log read when the dialog opens.
- Render a loading message in the log body while that initial read is pending.
- Render "No logs yet." only after a completed read returns an empty string.
- Preserve the currently displayed content during the existing ten-second polling refresh.
- Preserve the existing Application Logs dialog layout, resizing, position persistence, close action, clear action, and log polling interval.
- Add automated coverage for the loading-to-empty and loading-to-content transitions.

## Out of Scope

- Changing the log storage format, rolling-file behavior, or server functions.
- Changing the polling interval or adding a manual refresh control.
- Adding a new error dialog, retry workflow, or offline mode for failed log reads.
- Changing the text, formatting, ordering, or scrolling behavior of loaded log content.
- Changing the clear-log confirmation behavior; the existing clear action remains immediate.

## User Experience

### Initial open

When the dialog changes from closed to open:

1. Begin the existing log read.
2. Render a loading status in the body while the first read is pending.
3. Do not render "No logs yet." during this pending period.
4. When the read resolves with non-empty content, render the log content and retain the existing automatic scroll-to-bottom behavior.
5. When the read resolves with an empty string, render "No logs yet.".

The loading status should use the repository's existing loading-state presentation and wording convention. It should be visible text, not only a spinner, so the state is understandable to assistive technology and users who do not perceive animation.

### Background refresh

The dialog continues to refresh logs every ten seconds while open.

- A background refresh must not replace loaded content with the loading state.
- A background refresh must not temporarily show "No logs yet." because the request has not completed.
- If a refresh returns non-empty content, replace the displayed content using the existing scroll-position rules.
- If a refresh returns an empty string, replace the displayed content with "No logs yet.".
- Closing the dialog stops the polling timer and prevents an in-flight response from updating the closed dialog.

### Clear logs

The existing Clear logs action remains available. After the server-side clear succeeds, the dialog immediately enters the loaded-empty state and displays "No logs yet.". The clear action must not display the initial loading state because it is not the dialog's initial log read.

## Behavioral Requirements

1. The log viewer must represent at least these distinct states:
   - Initial read pending
   - Read completed with log content
   - Read completed without log content
2. The initial state must be pending whenever a newly opened dialog has not yet received its first read result.
3. The empty-state message must be gated by completion of the first read; an unset or pending value must not be treated as an empty result.
4. Background refreshes must retain the last completed display state until the new response is available.
5. A response received after the dialog closes must not update the dialog state.
6. The existing log text and scroll behavior must remain unchanged once content is loaded.
7. The existing clear action must continue to clear server-side logs and then display the loaded-empty state.
8. The loading status and empty status must be exposed as readable text in the dialog body.

## State Model

The UI state should distinguish request lifecycle from log content. A suitable state model is:

- `loading`: the first read after opening is pending; show the loading status.
- `loaded` with non-empty content: show the log `<pre>`.
- `loaded` with empty content: show "No logs yet.".

The ten-second refresh uses the existing loaded state while its request is pending. It updates the state only after the response resolves.

## Acceptance Criteria

1. Opening the Application Logs dialog while `getAppLogs()` is pending shows a loading status and does not show "No logs yet.".
2. When the pending request resolves with an empty string, the loading status is removed and "No logs yet." is shown.
3. When the pending request resolves with log text, the loading status is removed and the log text is shown.
4. While an already loaded dialog performs a background refresh, its previous content remains visible until the refresh resolves.
5. A background refresh that resolves empty shows "No logs yet." only after resolution.
6. A background refresh that resolves with content shows the new content and preserves the existing near-bottom scrolling behavior.
7. Closing the dialog prevents a late response from changing its state and stops future polling.
8. Clearing logs successfully leaves the dialog in the loaded-empty state and shows "No logs yet.".
9. Existing dialog actions, sizing, persisted position, polling cadence, and loaded-log rendering continue to work.

## Implementation Guidance

The change belongs in `src/components/shared/LogViewerDialog.tsx`. Keep the server API and rolling logger unchanged. Replace the current single empty-string sentinel with explicit request-state tracking, or an equivalent discriminated state that cannot confuse pending with an empty response.

The current component already provides the required lifecycle boundaries:

- `props.open` starts and stops the read/polling lifecycle.
- `firstLoad` identifies the initial response for scroll handling.
- `stopped` prevents late responses from updating a closed dialog.

The implementation should preserve these boundaries while making the rendered state explicit.

## Testing Decisions

Tests should verify observable behavior and state transitions rather than the exact signal or variable names.

### Component or UI tests

Cover these scenarios:

1. Initial request pending: loading text is visible and "No logs yet." is absent.
2. Initial request resolves empty: "No logs yet." is visible and loading text is absent.
3. Initial request resolves with content: log text is visible and loading text is absent.
4. Existing content remains visible while a later refresh is pending.
5. A later refresh can transition from content to the empty state after it resolves.
6. Clear logs transitions the viewer to the empty state after the clear operation succeeds.

### Regression coverage

Run the repository's standard validation for the changed UI component. Existing project-header coverage should continue to verify that the Application Logs control remains present and usable.

## Definition of Done

- The dialog never presents "No logs yet." before the initial log request has completed.
- Empty and non-empty completed responses render the correct existing UI.
- Background refreshes do not cause loading-state flicker.
- Existing clear, close, scroll, resize, and polling behavior remains intact.
- Automated tests cover the loading, empty, content, and refresh transitions.
