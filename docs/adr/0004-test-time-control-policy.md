---
status: accepted
---

# Test Time Control Policy

E2e tests control browser-side time with Playwright's Clock API and unit tests control it with Vitest fake timers, while server-side I/O and CSS animations always run on real time. This keeps time-sensitive tests deterministic: results no longer depend on machine speed, and polling assertions complete in milliseconds instead of waiting out real intervals.

Every wait in a test is classified by what gates it:

- Timer-Driven Test: behavior gated on client JS timers (the 10s sync-pending poll, the 5s Herdr poll). Time is faked: `page.clock.install()` before the first navigation, then `page.clock.fastForward` past the interval. In unit tests: `vi.advanceTimersByTimeAsync` (the async variant flushes microtasks between timer runs and avoids the promise/timer deadlock of the sync variant).
- I/O-Driven Test: behavior gated on real work (git operations, server round-trips, file watchers). Time is real; assertions use `expect.poll`, `page.waitForRequest`, or auto-retrying locators, never fixed sleeps.
- Animation-Stabilization Test: behavior gated on CSS transitions settling. Playwright's clock does not drive CSS animations (they run on compositor real time), so these keep short real waits.

RequestIdleCallback is faked by the Playwright clock as a 50ms timer, so `fastForward(100)` after navigation is required to fire the deferred poll startup in the project page.

Long assertion timeouts (10-20s) are crash backstops for parallel-suite contention, not targets; a healthy converted test fires its assertion in well under a second.

## Measured effect

- Sync button polling tests: 15-20s real-time assertion windows replaced by `fastForward`; the not-found negative test went from a 3s sleep plus 15s window to 751ms.
- Conflict dialog launch: 1500ms sleep replaced by `waitForRequest` on the server call.
- Forest ticket archive: 3000ms sleep replaced by `poll` on the archived folder appearing.
- Diff review scope switches: default 1000ms `expect.poll` deadlines (too tight for server-side git diff fetches under load) raised to 15s backstops matching the file's own convention.
- Full e2e suite: 253 tests pass in 240s wall time.
