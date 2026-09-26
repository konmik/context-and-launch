# Final audit

Audited application commit `e17d100` and the associated test cleanup on 2026-09-26.

## Verdict

The scoped storage/context migration is implemented, but a clean completion sign-off is blocked by the Diff Review send scenario below. No production code was changed during this audit.

### Original verification failure: Diff Review composer/send

`e2e/diff-review.test.ts`, scenario `reviews a worktree change and preserves a queued prompt snapshot`, failed on both runs:

1. In the 12-file run, the queued prompt appeared, but the composer still contained the sent text at line 171.
2. A diagnostic attempt changed that assertion to `expect.poll` because background polling can display a queued item before the send response returns. The targeted rerun failed earlier at line 160: after filling feedback, Send remained disabled for the entire 30-second click timeout.

The polling-only change was reverted. The failure is not established to be merely an assertion timing issue; investigate live-refresh/input reactivity and the send lifecycle before closing the ticket. The useful failing test remains intact. No root cause is claimed from these two different failure symptoms.

### Finish follow-up

Input/network instrumentation reproduced the disabled Send button: the input handler ran, all background requests completed, but the feedback signal's effect did not commit. Disabling only the periodic `refresh(agentStatus)` made the original scenario pass. Agent status now uses `createStoredState` to publish completed background reads, with an explicit `get`/`refresh` context shared by the composer and queue. This retains status polling and refresh after send/retry without repeatedly refreshing an async memo in the interactive graph. All instrumentation was removed; the original E2E assertions remain unchanged. The 13 Diff Review E2E scenarios passed with completed-read publication.

The first `pnpm test:all` run also exposed missing E2E references for the four existing launcher confirmation buttons. Real-server scenarios were added for cancel/proceed on dirty and behind-upstream main branches, including a profile that records actual launch in the worktree. Full-suite verification is in progress.

## Data-flow review

| Area | Finding | Evidence |
| --- | --- | --- |
| App config, shared launcher config, boards, command templates | App-wide stores are provided once; consumers read through context and submit transforms. | `src/app.tsx`, the corresponding `*-storage.ts` adapters, settings tabs, and `src/pages/project.tsx` |
| Project launcher config | Project navigation selects a new store; in-flight updates retain their original project. Merged launcher state derives from shared and project stores. | `project-launcher-config-storage.ts`, keyed project provider in `pages/project.tsx`, project-switch component test |
| Config persistence | Owner-bound reads and writes share the service-container instances. Client transforms serialize JSON and release leases in `finally`. Store validation precedes atomic repository writes. | `stored-config.ts`, `update-lock.ts`, `service-container.ts`, config stores and APIs |
| Ticket order | Updates read fresh order, submit expected/next values, and publish successful writes. Board snapshots refresh the store; navigation isolates in-flight saves. | `ticket-order-storage.ts`, `ticket-order.ts`, `KanbanBoard.tsx`, storage tests |
| Forest layout | Root and nested surfaces share a store. Position updates merge into fresh persisted state and reject stale replacements. Group/ungroup refresh layout and ticket data. | `forest-layout-storage.ts`, `ForestSurface.tsx`, `ForestView.tsx`, `forest-layout-store.ts` |
| Ticket status | Ticket-detail edits use the shared ticket store. Saves apply changed fields/reference deltas to current ticket data under exclusive mutation. Other domain actions remain valid writers. | `ticket-status-storage.ts`, `saveTicketStatus` in `ticket-api.ts`, `ForestView.tsx` |
| Refresh after domain actions | Forest dependency actions revalidate ticket data; group actions also refresh layout. Ticket detail refreshes on worktree revisions. | `ForestView.tsx`, `ticket-detail-state.ts` |
| Diff Review | Reviewed lines and queues share stored config. Background delivery uses the same project lock; mounted review polls refresh state through the queue. Tracker lifetime follows worktree identity. | `DiffReview.tsx`, `diff-review-storage.ts`, `diff-review-store.ts`, reviewed-line and queue tests |
| Appearance | Explicit palette/theme keys use shared stored signals, with route-selected project/global scope and independent preference inheritance. Renderer, preload, and main-process IPC consistently use `setAppearance`; old palette/mode IPC calls are absent. | `appearance.tsx`, `PalettePicker.tsx`, appearance storage tests, `electron/preload.ts`, `electron/main.ts` |
| Launcher semantics | Shared/project data remains separate; merged consumers preserve project precedence, ordering, and existing inheritance. Rename/delete transforms update references. The old `latestMergedConfigs` cache is absent. | `launcher-config-data.ts`, `launcher-settings-item-section.tsx`, launcher tests |
| Failure behavior | Shared queue publishes successful persisted values, preserves previous state on failure, and accepts subsequent operations. Consumers retain drafts/report errors. | `stored-state.ts`, `stored-signal.test.ts`, `app-config-store.test.ts`, component integration tests |

## Test cleanup

Six standalone test cases removed, retaining the meaningful coverage:

| Removed test | Reason / retained coverage |
| --- | --- |
| `src/util/stored-config.test.ts` (one test; file deleted) | Transform/request failure release and optional-field removal already run through real `AppConfigStore` persistence in `app-config-store.test.ts`. |
| Appearance failed-write test | Repeated shared queue exception/publication behavior covered by `stored-signal.test.ts`. Appearance-specific inheritance, key isolation, and fresh-storage updates remain tested. |
| Forest layout overwrite test | Repeated full-layout replacement behavior covered by the remaining replacement and stale-write tests. |
| Ticket cross-column move test | Manually called both status and order writes, so it could not detect a missing write in the actual UI flow. Real drag-and-drop is covered by `board-config-flow.test.ts`. |
| Ticket same-column reorder/status test | Manually called only the order writer and asserted status was untouched. Order transforms/persistence retain their direct tests. |
| Forest no-remount E2E test | Repeated the same drag/persist setup. Its DOM-identity assertion was moved into the existing drag/dependency persistence scenario. |

## Verification

- `pnpm test`: passed type-checking, ESLint/Oxlint, and 1,123 tests across 149 files. The runner reported 663 skipped cases in its sharded test collection.
- After consolidating the Forest E2E scenario: `pnpm exec eslint e2e/forest-layout.test.ts`, `pnpm exec tsc --noEmit`, and `git diff --check` passed.
- Production build passed. The scoped E2E run passed 68 of 69 tests across 12 files; only the Diff Review scenario above failed.
- `pnpm test:e2e e2e/diff-review.test.ts`: the diagnostic rerun passed 12 of 13 tests and failed at the disabled Send button. The experimental assertion change was then reverted.
- ESLint and Oxlint passed for the E2E test edits.
