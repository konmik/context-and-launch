---
status: accepted
---

# Test Time Control Policy

E2e tests control browser-side time with Playwright's Clock API and unit tests control it with Vitest fake timers, while server-side I/O and CSS animations always run on real time. This keeps time-sensitive tests deterministic: results no longer depend on machine speed, and polling assertions complete in milliseconds instead of waiting out real intervals.

Every wait in a test is classified by what gates it:

- Timer-Driven Test: behavior gated on client JS timers (the 10s sync-pending poll, the 5s Herdr poll). Time is faked: `page.clock.install()` before the first navigation, then `page.clock.fastForward` past the interval. In unit tests: `vi.advanceTimersByTimeAsync` (the async variant flushes microtasks between timer runs and avoids the promise/timer deadlock of the sync variant).
- I/O-Driven Test: behavior gated on real work (git operations, server round-trips, file watchers). Time is real; assertions use `expect.poll`, `page.waitForRequest`, or auto-retrying locators, never fixed sleeps.
- Animation-Stabilization Test: behavior gated on CSS transitions settling. Playwright's clock does not drive CSS animations (they run on compositor real time), so these keep short real waits.

RequestIdleCallback is faked by the Playwright clock as a 50ms timer, so the deferred poll startup in the project page needs a short advance after navigation. `gotoProjectOnFakeClock` in the e2e fixtures does that advance, and `fastForwardPastSyncPoll` runs the next Sync Pending poll, so tests name the interval they wait on instead of repeating raw millisecond values.

A test that waits on a faked timer AND on real server-side work needs more than one advance: the first poll can fetch before the server's file watcher has bumped the worktree revision. `fastForwardUntilVisible` runs one poll per attempt until the element shows, rather than advancing once and hoping the race fell the right way.

Long assertion timeouts (10-20s) are crash backstops for parallel-suite contention, not targets; a healthy converted test fires its assertion in well under a second.

## Measured effect

- Sync button polling tests: 15-20s real-time assertion windows replaced by `fastForward`; the not-found negative test went from a 3s sleep plus 15s window to 751ms.
- Conflict dialog launch: 1500ms sleep replaced by `waitForRequest` on the server call.
- Forest ticket archive: 3000ms sleep replaced by `poll` on the archived folder appearing.
- Diff review scope switches: default 1000ms `expect.poll` deadlines (too tight for server-side git diff fetches under load) raised to 15s backstops matching the file's own convention. Under the full parallel suite those tests finish in 1.5s to 3.1s end to end, so the deadline is 5x clear of the slowest observed run.
- Full e2e suite: 252 tests pass in 57s wall time on the T: RAM disk (Windows, 8 forks).
