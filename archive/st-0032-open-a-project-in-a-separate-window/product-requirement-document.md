# Open a project in a separate window

## Problem Statement

Working on several projects means constantly toggling the single window between them via the projects dropdown. Every toggle loses visual context, and there is no way to spread projects across virtual desktops. The developer wants to switch between windows, not switch the content of one window.

## Solution

Each item in the projects dropdown gets an open-in-new-window button (square-and-arrow icon). Clicking it opens that project in its own Project Window while the current window stays put. Any number of Project Windows run against the one server at the same time, each fully live. The desktop app restores the open Project Windows on next launch (Session Restore), so a multi-desktop layout survives restarts.

## Requirements

1. Every project row in the projects dropdown shows an open-in-new-window icon button, always visible — because the feature must be discoverable at the point where projects are switched.
2. Clicking the button opens that project in a new Project Window and leaves the current window on its project — because the goal is switching between windows instead of retargeting the current one.
3. The button is disabled when the project is unavailable, matching its row — because a window on a missing project path can only show an error.
4. Clicking the button for a project that already has a Project Window focuses that window instead of opening a duplicate — because windows act as switch targets and duplicates add nothing.
5. Plain click on a row keeps navigating the current window in place — because in-place switching remains a valid workflow and must not change.
6. The server serves any number of Project Windows across different Projects concurrently: every open project's Worktree stays watched, so external file changes, auto-commit, and the sync-pending indicator stay fresh in all windows regardless of which project was loaded last — because a window that silently goes stale defeats the point of keeping it open.
7. Each Project Window's title contains the project name — because taskbar and alt-tab switching across desktops needs distinguishable titles.
8. Desktop app only: Session Restore reopens the Project Windows that were open at last quit, each with its saved size, position, and maximized state — because a multi-desktop layout is expensive to rebuild by hand every launch.
9. Closing a Project Window removes it from the next restore; the window whose close ends the session is kept — because deliberate closes should stick, while exiting the app by closing everything must not lose the session entirely.
10. Restore skips entries whose project is gone from the Project Registry, still opens entries whose project is unavailable on disk (the project page error state surfaces the problem), and clamps off-screen bounds into a display — because startup must not fail on stale entries, errors must be visible not hidden, and unplugged monitors are routine in a multi-desktop workflow.
11. With no restore data, startup opens a single window that lands on the last-used project as today — because fresh installs and browser app mode keep their existing behavior.
12. The last-used project means the last focused project — because with several windows open, "last loaded" is arbitrary (any background revalidation could claim it).
13. A window spawned by the button opens at the opener's size, cascaded from the opener, fully on-screen (desktop app); browser app mode leaves size and placement to the browser — because identically stacked windows are indistinguishable.
14. Launching a second app instance focuses the most recently focused Project Window — because the single-instance behavior must generalize from one window to many.
15. The server still shuts down when the last window closes, with the existing pending-operation grace period — because multi-window must not weaken the lifecycle guarantee that no git operation is killed mid-flight.

## Implementation Decisions

- The window-opening seam is a single client call: open the project page URL with the projectSlug as the window target name. No preload script and no IPC; the same call serves the desktop app and browser app mode.
- In the desktop app, the main process intercepts popup creation: an existing window for that target name is focused and the popup denied; otherwise a real window is created at the project URL.
- The URL remains the sole source of truth for which project a window shows; no server-side or client-side current-project singleton is introduced.
- File watching becomes additive: loading a project page watches that project's Worktree without stopping others. Watchers stop only on server shutdown and project removal. The stop-all-others watch mode is removed.
- The lastUsedProjectSlug write moves out of the project page load. The client fires a fire-and-forget server call on initial project load and on window focus. The value is consumed only by the root redirect.
- The desktop window-state store becomes an ordered list of entries (projectSlug, bounds, maximized), maintained by the main process, which learns each window's project by observing in-page navigation. The old single-object shape is migrated on first read: its bounds seed the single default window, then the list shape is written.
- The final window close of a session does not persist its own removal from the list; that is what implements requirement 9.
- A window registry replaces the single main-window reference; the second-instance handler and shutdown flow read from it. The shutdown trigger and pending-operation drain are unchanged.
- Cascade offset is a fixed small step from the opener, clamped to the display.
- Duplicate windows on one project remain possible via plain in-place navigation and are harmless: the server is per-request, watchers are additive, each window polls independently. The button focuses the most recently focused duplicate.
- The project page sets the document title from the project name.

## Testing Decisions

- Tests assert external behavior at the highest existing seam: the real-server e2e harness with one server and two Playwright pages, asserting on real side effects (files on disk, UI state), never on internals.
- e2e: two pages on two projects; touch a ticket file in the first project's Worktree while the second project was loaded last; assert the first page stays live (sync-pending / board revalidation). This pins the additive-watch behavior to an observable effect.
- e2e: click the open-in-new-window button; assert the popup lands on the target project page and the opener's URL is unchanged. Click again; assert the named target is reused and no second popup appears.
- One new seam: the desktop window bookkeeping (restore-list mutations including close semantics, cascade and clamp math, window-state migration) is extracted into a pure module and unit-tested without the desktop runtime, per the component-architecture rule on pure function modules.
- Prior art: existing e2e suites built on the real-server harness and Playwright fixtures.

## Out of Scope

- Session Restore for browser app mode (the browser owns those windows).
- IPC or preload infrastructure.
- Enforcing one window per project on plain in-place navigation.
- Per-window last-used tracking.

## Further Notes

- Glossary terms Project Window and Session Restore are defined in CONTEXT.md.
- Browser app mode already runs a persistent server that serves many clients; the desktop app reuses that property, so no server architecture change is needed beyond additive file watching.
