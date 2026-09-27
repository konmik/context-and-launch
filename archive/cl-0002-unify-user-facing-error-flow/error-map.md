# Error map

One row per error flow. Paths relative to the app repo: C = src/components, K = src/core. Braces list files sharing a directory. The table records the pre-refactor source/display inventory.

## Migration audit

- Forms, settings, ticket operations, launching, and sync now preserve UserFacingError through their results. ErrorInfo is an alias of that contract.
- C/shared/error-presentation.tsx matches registered fields, opens C/shared/ErrorDialog.tsx, and sends background or detached-operation failures to C/shared/toast-queue.tsx.
- C/shared/LoadError.tsx presents application, project, and diff-load failures with retry and full-error access.
- Raw file responses now carry the error payload. Ticket file loading rejects failed responses instead of replacing content with empty text.
- Folder-opening and log-viewer failures now reach the presentation layer.
- Agent polling and review reconciliation report background failures. Persisted delivery errors retain details and are reported through project polling.
- Recovery warnings and desktop bootstrap diagnostics in the final two rows remain diagnostic paths; they do not use the in-app queue.

## Original inventory

| Error | Raised / passed through | Shown |
| --- | --- | --- |
| Project registration, path/branch validation, directory picker | K/project/project-registry.ts; K/infra/native-file-dialog.ts; C/project/{project-api,add-project-controller}.ts | C/project/AddProjectForm.tsx:86 |
| Project deletion | K/project/project-registry.ts; C/project/{project-api,project-page-controller,delete-project-controller}.ts | C/project/DeleteProjectDialog.tsx:36 |
| Project/ticket board loading, missing or unavailable project | K/board/project-page-service.ts; K/worktree/worktree-manager.ts; C/project/project-api.ts | src/pages/project.tsx (page error/unavailable/not-found states) |
| Ticket synchronization, remote configuration | K/ticket/ticket-sync.ts; C/ticket/ticket-api.ts; C/project/{project-page-controller,project-page-pure}.ts | src/pages/project.tsx:682 -> C/shared/ErrorDialog.tsx |
| Sync-status loading | K/board/project-page-service.ts; C/project/project-api.ts; src/pages/project.tsx:337 | SyncStatusErrorButton -> src/pages/project.tsx:682 -> ErrorDialog |
| Conflict resolution, abort, saved profile | K/launcher/resolve-conflicts.ts; K/ticket/ticket-sync.ts; C/launcher/launcher-api.ts; C/shared/conflict-dialog-controller.ts | C/shared/ConflictDialog.tsx:47 |
| Ticket creation, duplicate/blank number or title, empty board | K/ticket/ticket-store.ts; K/board/initial-ticket-status.ts; C/ticket/{ticket-api,create-ticket-controller,form-dialog-controller}.ts | C/ticket/CreateTicketDialog.tsx:85 |
| Archive/delete ticket; cleanup checks/actions, locked worktree, process kill, branch deletion | K/worktree/{ticket-cleanup-checks,worktree-cleanup,agent-worktree}.ts; K/ticket/ticket-store.ts; C/ticket/ticket-api.ts; C/shared/ticket-cleanup-controller.ts | C/shared/TicketCleanupDialog.tsx:169,200,215 |
| Ticket header, status, references, launcher defaults save/refresh | K/ticket/ticket-store.ts; C/ticket/{ticket-api,ticket-detail-state}.ts; C/ticket/TicketDetailDialog.tsx:290 | C/ticket/TicketDetailDialog.tsx:416 -> ErrorDialog |
| Context/file/reference load, external-change check, save, delete | K/ticket/{ticket-store,ticket-repository}.ts; C/ticket/{ticket-api,ticket-detail-state}.ts | C/ticket/TicketDetailDialog.tsx:416 -> ErrorDialog |
| Raw file/reference HTTP errors | K/ticket/ticket-store.ts; src/server/raw-route-handler.ts:35,47 | No explicit HTTP-error UI: C/ticket/ticket-detail-state.ts:277,361 substitutes empty text; images use browser rendering |
| File upload, protected status.json, per-file failure | K/ticket/ticket-store.ts; C/ticket/{ticket-api,ticket-detail-upload}.ts | C/ticket/TicketDetailDialog.tsx:416 -> ErrorDialog |
| Reference picker / add reference | K/infra/native-file-dialog.ts; C/ticket/{ticket-api,ticket-detail-state}.ts | C/ticket/TicketDetailDialog.tsx:416 -> ErrorDialog |
| Open ticket worktree | C/ticket/ticket-api.ts; C/board/board-shortcut-runner.ts; C/ticket/ticket-detail-state.ts | src/pages/project.tsx:681 or C/ticket/TicketDetailDialog.tsx:416 -> ErrorDialog |
| Shortcut execution / missing shortcut | C/launcher/launcher-api.ts; C/ticket/ticket-detail-shortcuts.ts; C/board/board-shortcut-runner.ts | src/pages/project.tsx:681 or C/ticket/TicketDetailDialog.tsx:416 -> ErrorDialog |
| Agent launch, missing profile/directory, duplicate launch | K/launcher/{agent-launch,profile-launch}.ts; K/worktree/agent-worktree.ts; C/launcher/{launcher-api,agent-launcher-controller,agent-launcher-pure}.ts | C/launcher/AgentLauncher.tsx:148 -> ErrorDialog |
| Dirty worktree / behind remote launch or shortcut | K/launcher/agent-launch.ts; K/worktree/agent-worktree.ts; C/launcher/agent-launcher-controller.ts; C/ticket/ticket-detail-shortcuts.ts | C/launcher/AgentLauncher.tsx:150,173; C/ticket/ticket-detail-parts.tsx (ShortcutConfirmationDialog) |
| Project launcher defaults save | C/launcher/ProjectLauncherDialog.tsx:62; C/launcher/launcher-api.ts | C/launcher/ProjectLauncherDialog.tsx:149 -> ErrorDialog |
| Ticket move / order save | K/ticket/{ticket-store,ticket-order}.ts; C/ticket/ticket-api.ts; C/board/KanbanBoard.tsx:49,56 | C/board/KanbanBoard.tsx:79 |
| Forest layout, dependencies, group membership/create, ticket refresh | K/ticket/{forest-layout-store,ticket-store}.ts; C/forest/forest-api.ts; C/forest/{ForestView,ForestSurface}.tsx | C/forest/ForestView.tsx:290 -> ErrorDialog; group-create failure also reaches CreateTicketDialog |
| Invalid/orphaned ticket status | K/ticket/ticket-store.ts (board classification) | C/board/kanban-columns.tsx:155; C/ticket/TicketCard.tsx:148 |
| Board selection / view configuration save | C/board/board-api.ts; C/config/app-config-api.ts; src/pages/project.tsx:260 | src/pages/project.tsx:683 -> ErrorDialog |
| Appearance save | C/shared/appearance.tsx; C/shared/PalettePicker.tsx:17 | C/shared/PalettePicker.tsx:80 -> ErrorDialog |
| Launcher item save/delete/reorder, duplicate/missing item | C/launcher/launcher-settings-item-section.tsx; C/launcher/{shared-launcher-config-api,launcher-api}.ts | C/launcher/launcher-settings-item-section.tsx:234 -> ErrorDialog |
| Board/column validation, create/rename | K/project/board-config-data.ts; C/launcher/launcher-settings-pure.ts; C/launcher/launcher-settings-columns-tab.tsx | C/launcher/launcher-settings-dialogs.tsx:241,264,363,455 |
| Board/column delete, migration/rollback, defaults, reorder | K/project/{board-config,board-config-data,column-rename-migration}.ts; C/board/board-api.ts; C/launcher/launcher-settings-columns-tab.tsx | C/launcher/launcher-settings-columns-tab.tsx:416 -> ErrorDialog |
| Command-template configuration save/validation | K/command-template/command-template-store.ts; C/launcher/command-template-api.ts; C/launcher/launcher-settings-command-templates-tab.tsx | C/launcher/launcher-settings-command-templates-tab.tsx:40 -> ErrorDialog |
| Misc settings save, project paths, directory picker | K/project/project-registry.ts; K/infra/native-file-dialog.ts; C/launcher/{launcher-settings-misc-tab,settings-folder-field}.tsx | C/launcher/launcher-settings-misc-tab.tsx:261 -> ErrorDialog |
| Diff load/scope/path/worktree/Git state | K/diff-review/{diff-review-target,diff-review-git}.ts; C/diff-review/{diff-review-api,diff-review-file-tree}.ts | C/diff-review/DiffReview.tsx:240,258,766 (DiffLoadError / DiffScopeUnavailable) |
| Review state/visible-line persistence, selection, drag data, refresh | K/diff-review/{diff-review-model,diff-review-store}.ts; C/diff-review/{diff-review-state-api,diff-review-storage}.ts; C/diff-review/{DiffReview,DiffSurface}.tsx | C/diff-review/DiffReview.tsx:885 |
| Review prompt send, profile save, clipboard/drag | K/diff-review/{review-prompt-queue,diff-review-store,review-agent-launcher}.ts; C/diff-review/diff-review-api.ts; C/diff-review/{DiffReview,ReviewPromptComposer}.tsx | C/diff-review/ReviewPromptComposer.tsx:165 |
| Review prompt retry/removal/refresh | K/diff-review/{review-prompt-queue,diff-review-store}.ts; C/diff-review/{diff-review-api,diff-review-state-api}.ts; C/diff-review/ReviewPromptQueueList.tsx | C/diff-review/ReviewPromptQueueList.tsx:108 |
| Review delivery failure, interrupted/uncertain delivery, lost agent | K/diff-review/{review-prompt-queue,diff-review-store}.ts; K/herdr/{herdr-exec,herdr-control,herdr-availability}.ts | C/diff-review/ReviewPromptQueueList.tsx:132 |
| Background agent polling / review reconciliation | C/board/herdr-status-service.ts; K/diff-review/review-prompt-queue.ts; src/pages/project.tsx:227,240 | Browser console only for polling/reconciliation exceptions |
| Debug sample | C/shared/DebugToastButton.tsx -> C/shared/toast-queue.tsx | C/shared/ErrorToast.tsx |
| Uncaught render/query/config-read errors, missing context, invalid saved view mode | src/util/stored-config.ts; C/ticket/herdr-statuses-context.ts; C/shared/toast-queue.tsx; C/forest/forest-local-state.ts; other unhandled reads | src/app.tsx:21 (Errored); local diff/sync boundaries where present |
| Open project/tickets/config folder; log read/clear rejection | C/shared/{shared-api,log-api}.ts; K/command-template/command-template-service.ts | No local error handler in callers (project toolbar, settings, LogViewerDialog) |

## Shared origins

These feed the caller's display above; descriptions are not separately displayed here.

| Error | Raised / passed through | Shown |
| --- | --- | --- |
| Invalid/missing configuration, JSON, unsafe names/paths, update identity/lock | K/config/{config-paths,config-repository,app-config-data,app-config-store,instances,service-container}.ts; K/project/{board-config,board-config-data,column-color-palette}.ts; K/launcher/{launcher-config,launcher-config-data,shared-launcher-config-store}.ts; src/util/{update-lock,stored-state,stored-config}.ts; C/{config/app-config,board/board,launcher/launcher,launcher/shared-launcher-config,launcher/command-template,diff-review/diff-review-state}-api.ts | Calling settings/form/review display; uncaught reads -> src/app.tsx |
| Command unavailable, spawn/interpreter/exit failure; Git version/branch failure | K/command-template/{command-template-definitions,command-template-service,platform-shell-runner}.ts; K/infra/{git,git-repository,git-merge-tree}.ts; K/shared/errors.ts | Calling operation's error display; command logs -> C/shared/{LogViewerDialog,LogTextView}.tsx |
| Ticket path/name, transaction/rollback, worktree ownership/branch safety | K/ticket/{ticket-naming,ticket-store,ticket-repository}.ts; K/worktree/{worktree-manager,agent-worktree,worktree-cleanup}.ts | Calling ticket/board/launch/cleanup display |
| Agent unavailable/ambiguous panes or agents | K/herdr/{herdr-availability,herdr-exec,herdr-control}.ts | Calling launch/shortcut/cleanup/review display; C/ticket/HerdrStatusIcon.tsx shows availability status |
| Watcher/autocommit, skipped migration/read/upstream check, deferred cleanup warnings | K/infra/{file-watcher,git-repository}.ts; K/project/column-rename-migration.ts; K/ticket/{ticket-repository,ticket-sync}.ts; K/worktree/{worktree-manager,agent-worktree}.ts; K/launcher/{profile-launch,launch-request}.ts | Console warnings; no dedicated error UI |
| Desktop server/protocol/window startup | electron/{server-adapter,app-protocol,main}.ts | Console/rejected startup or request; no dedicated error dialog |
