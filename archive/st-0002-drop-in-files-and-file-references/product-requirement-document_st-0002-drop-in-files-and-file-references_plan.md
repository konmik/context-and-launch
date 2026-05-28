# Implementation Plan: ST-0002 Drop-in Files and File References

## Codebase Conventions Discovered

1. API routes live under `src/routes/api/` using SolidStart file-based routing. Each exports named functions like `GET`, `POST`, `PUT`, `DELETE`. They receive `APIEvent` with `params` and `request`.
2. All API routes import `worktreeManager` from `~/server/instances.js` and create a `new TicketStore(worktreeDir)` per request.
3. Error handling pattern: wrap body in try/catch, return `new Response(errorMessage(e), { status: 400 })` on error.
4. `TicketStore` uses `requireContained()` and `requireSimpleName()` for path traversal prevention. `requireContainedIn(filePath, parent, label)` validates that a resolved path stays within a parent directory.
5. `autoCommit(workDir, message)` in `git.ts` does `git add -A && git commit -m message`, swallowing errors.
6. `StatusJson` interface in `ticket-store.ts` defines the on-disk shape. `TicketInfo` in `types.ts` is the client-facing shape. `readTicket()` maps between them.
7. Tests use vitest. Unit tests create temp git repos via `fs.mkdtempSync` and `git init`. E2e tests use Playwright with a custom mock HTTP server (`e2e/mock-server.ts`).
8. Components use SolidJS signals, `createEffect` with `on()`, and `Show`/`For` control flow. The `TicketDetailDialog` component is the main editing surface.
9. The `MarkdownEditor` component wraps CodeMirror 6. It accepts `value`, `onChange`, `onSave`, `placeholder`.
10. The `TicketDetailDialog` currently only handles `.md` files. The file dropdown shows options from `stageNames` (which are `.md` filenames without extension) plus defaults.
11. The project uses TailwindCSS v4 with utility classes.

## Step 1: Extend StatusJson and TicketInfo Types

Dependencies: None. This must be done first because all other steps depend on these types.

Files to modify:
- `src/server/ticket-store.ts` -- Add `references?: { path: string }[]` to the `StatusJson` interface.
- `src/types.ts` -- Add `fileNames: string[]` and `references: { path: string; exists: boolean }[]` to the `TicketInfo` interface.

Changes in ticket-store.ts:
- In the `StatusJson` interface, add: `references?: { path: string }[]`
- In `readTicket()`, include `references` and `fileNames` in the returned `TicketInfo`
- In `updateTicket()`, preserve existing references when updating other fields (currently builds a new object from specific fields, so `references` would be lost without explicitly including it)

Acceptance criteria:
- `StatusJson` has an optional `references` array
- `TicketInfo` has `fileNames` and `references` fields
- `readTicket()` passes references through to the client with existence checks
- `updateTicket()` preserves existing references when updating other fields
- Existing tickets without references continue to work (the field is optional)

Validation: Run `npm test` -- existing tests pass without changes.

## Step 2: Add TicketStore Methods for File and Reference Operations

Dependencies: Step 1.

File to modify: `src/server/ticket-store.ts`

New methods to add to `TicketStore`:

- `listTicketFiles(folderName)` -- lists all files in ticket folder excluding status.json
- `copyFileToTicket(folderName, fileName, content: Buffer)` -- validates name, rejects status.json, writes file, autoCommits
- `deleteTicketFile(folderName, fileName)` -- validates path, deletes file, autoCommits
- `getFileContent(folderName, fileName)` -- validates path, returns buffer content
- `addReference(folderName, refPath)` -- reads status.json, appends to references array, writes back, autoCommits
- `removeReference(folderName, refPath)` -- reads status.json, filters out path, writes back, autoCommits
- `getReferencedFileContent(refPath)` -- returns buffer content for referenced file

All path-manipulating methods use `requireSimpleName` or `requireContainedIn` for security.

Acceptance criteria:
- `copyFileToTicket` writes a file to the ticket folder and autoCommits
- `copyFileToTicket` rejects `status.json` as filename
- `addReference` persists a reference in status.json
- `removeReference` removes a reference from status.json
- `deleteTicketFile` removes a file from the ticket folder

Validation: Unit tests (Step 2b).

## Step 2b: Unit Tests for TicketStore Extensions

Dependencies: Step 2.

File to modify: `src/server/ticket-store.test.ts`

Two tests per PRD testing spec:
1. "Copying a file writes it to the ticket folder and the file can be read back"
2. "Adding a reference persists it in status.json and removing it clears it"

Validation: `npm test` passes.

## Step 3: Create File Browser Service

Dependencies: None (independent of Steps 1-2).

File to create: `src/server/file-browser.ts`

Exports:

```
interface FileEntry { name: string; type: 'file' | 'directory'; size: number }
function listDirectory(dirPath: string, showHidden?: boolean): FileEntry[]
```

- Use `path.resolve(dirPath)` to normalize
- Use `fs.readdirSync(dirPath, { withFileTypes: true })` to list
- Filter hidden files (names starting with `.`) unless showHidden is true
- Sort directories first, then files, alphabetically
- Wrap stat calls in try/catch for permission errors (skip entries that throw)

Edge cases: non-existent directory throws, permission denied entries skipped, empty directory returns empty array.

## Step 3b: Unit Tests for File Browser Service

Dependencies: Step 3.

File to create: `src/server/file-browser.test.ts`

Two tests:
1. "Listing a directory returns correct entries with types and sizes"
2. "Hidden files are excluded by default and included when the flag is set"

Validation: `npm test` passes.

## Step 4: Create API Routes

Dependencies: Steps 2 and 3.

Files to create:

4a. `src/routes/api/projects/[slug]/board/tickets/[folderName]/files/upload.ts`
- POST: reads multipart form data, calls `store.copyFileToTicket` for each file

4b. `src/routes/api/projects/[slug]/board/tickets/[folderName]/files/[fileName].ts`
- GET: serves file content with appropriate MIME type
- DELETE: calls `store.deleteTicketFile`

4c. `src/routes/api/projects/[slug]/board/tickets/[folderName]/references.ts`
- POST: body `{ paths: string[] }`, calls `store.addReference` for each
- DELETE: body `{ path: string }`, calls `store.removeReference`

4d. `src/routes/api/projects/[slug]/board/tickets/[folderName]/references/content.ts`
- GET: query param `path=...`, serves referenced file content with safe content types only

4e. `src/routes/api/browse.ts`
- GET: query params `dir` and `showHidden`, calls `listDirectory`, returns JSON

All routes follow existing patterns with try/catch, errorMessage, worktreeManager.

## Step 5: Create File Browser Dialog Component

Dependencies: Step 4e.

File to create: `src/components/FileBrowserDialog.tsx`

Props: `open: boolean`, `onClose: () => void`, `onConfirm: (paths: string[]) => void`

Internal state:
- `currentDir` -- initialized from API response (defaults to homedir)
- `entries` -- directory listing
- `selectedPaths` -- Set for multi-select
- `showHidden` -- toggle
- `loading` -- loading state

UI:
- Modal overlay (z-[60])
- Current directory display
- "Go up" button
- Entry list: directories clickable to navigate, files with checkboxes
- Hidden files toggle
- Cancel / "Add References" buttons

## Step 6: Modify TicketDetailDialog

Dependencies: Steps 4, 5.

File to modify: `src/components/TicketDetailDialog.tsx`

Sub-parts:

6a. Extend file selector dropdown to include all file types (stages, copied files, references)

6b. Reshape active file tracking with a union type:
```
type ActiveFile =
  | { type: 'stage'; name: string }
  | { type: 'file'; name: string }
  | { type: 'reference'; path: string }
```

6c. Extract "New markdown file" from dropdown into a button in a row with drop and reference buttons

6d. Add "Drop a file to copy" button with HTML5 drag-and-drop:
- Drop target with drag-over highlight
- Click fallback via hidden input[type=file]
- Size warning for files over 10 KB
- Overwrite confirmation for existing files
- Reject status.json
- Upload via multipart POST

6e. Add "Choose a file for reference" button that opens FileBrowserDialog

6f. Add viewer panels based on file type:
- markdown/text: MarkdownEditor (read-only for references)
- image (png, jpg, gif, webp, svg): img element
- other: "Unable to show" message

6g. Make MarkdownEditor support readOnly prop (modify `src/components/MarkdownEditor.tsx`)

6h. Modify delete/trash button: copied files delete with confirmation, references remove without confirmation

6i. Add stale reference detection: include `exists` field from readTicket, show warning icon for missing

6j. Load file content for non-stage files via appropriate API endpoints

6k. Save button hidden for read-only content (references, images, other)

## Step 7: E2E Tests

Dependencies: All above.

Files to modify:
- `e2e/mock-server.ts` -- Add handlers for new endpoints
- `e2e/setup-test-data.ts` -- Add fileNames and references to test data

File to create: `e2e/file-attach.test.ts`

Tests:
1. "Navigating into a subdirectory updates the file list"
2. "Selecting multiple files and confirming returns all selected paths"
3. "Dropping a file onto the copy button adds it to the dropdown and it can be selected"
4. "Selecting a referenced image file shows the image preview instead of the editor"

## Step Execution Order

1. Step 1 (types) -- no dependencies
2. Step 3 + Step 3b (file browser service + tests) -- parallel with Step 1
3. Step 2 + Step 2b (TicketStore extensions + tests) -- depends on Step 1
4. Step 4 (API routes) -- depends on Steps 2 and 3
5. Step 6g (MarkdownEditor readOnly prop) -- no dependencies
6. Step 5 (FileBrowserDialog component) -- depends on Step 4e
7. Step 6 (TicketDetailDialog modifications) -- depends on Steps 4, 5, 6g
8. Step 7 (E2E tests) -- depends on all above

## Files Summary

Files to create:
- `src/server/file-browser.ts`
- `src/server/file-browser.test.ts`
- `src/routes/api/projects/[slug]/board/tickets/[folderName]/files/upload.ts`
- `src/routes/api/projects/[slug]/board/tickets/[folderName]/files/[fileName].ts`
- `src/routes/api/projects/[slug]/board/tickets/[folderName]/references.ts`
- `src/routes/api/projects/[slug]/board/tickets/[folderName]/references/content.ts`
- `src/routes/api/browse.ts`
- `src/components/FileBrowserDialog.tsx`
- `e2e/file-attach.test.ts`

Files to modify:
- `src/types.ts`
- `src/server/ticket-store.ts`
- `src/server/ticket-store.test.ts`
- `src/components/TicketDetailDialog.tsx`
- `src/components/MarkdownEditor.tsx`
- `e2e/mock-server.ts`
- `e2e/setup-test-data.ts`

## Edge Cases

1. Concurrent file upload and reference addition -- autoCommit serializes via git; lock failures are non-fatal
2. Reference to externally deleted file -- stale detection shows warning icon
3. Very large files -- 10 KB warning only, no hard block
4. File named status.json -- always rejected
5. Unicode filenames -- requireSimpleName allows them
6. Windows path separators in references -- stored as-is from server-side path.resolve
7. Empty ticket folder -- dropdown shows only default options and references
8. Multiple rapid drops -- process sequentially for individual confirmations
