# ST-0002: Drop in files and file references

## Problem Statement

Tickets currently only support stage markdown files. Users have no way to attach supporting files (screenshots, logs, configs) to a ticket or reference files elsewhere on disk. This forces users to manually copy files into ticket folders or remember file paths, breaking the flow of ticket-based work.

## Solution

Add two file attachment mechanisms to the Ticket Detail Dialog:

1. Drop/click to copy a file into the ticket folder
2. Browse the filesystem to add a file reference (absolute path stored in status.json)

Both copied files and references appear in the existing file selector dropdown alongside stage markdowns. The viewer adapts to file type: markdown editor for text, image preview for images, "unable to show" for everything else. Referenced files are read-only.

## User Stories

1. As a user, I want to drag a file from my OS file manager onto the "Drop a file to copy" button, so that the file is copied into the ticket folder
2. As a user, I want to click the "Drop a file to copy" button to open a native file picker, so that I can copy a file without drag-and-drop
3. As a user, I want to drop multiple files at once, so that I can attach several files in a single action
4. As a user, I want to see a size warning when copying a file larger than 10 KB, so that I can decide whether to proceed or skip large files
5. As a user, I want to see a confirmation dialog when a copied file would overwrite an existing file, so that I don't accidentally lose data
6. As a user, I want status.json to be protected from overwrite, so that ticket metadata is never accidentally destroyed
7. As a user, I want to click "Choose a file for reference" to open a file browser dialog, so that I can select files by navigating the filesystem
8. As a user, I want the file browser to start at my home directory, so that I have a familiar starting point
9. As a user, I want to navigate to any directory on my system in the file browser, so that I can reference files anywhere
10. As a user, I want to toggle hidden files in the file browser, so that I can reference dotfiles and config files when needed
11. As a user, I want to select multiple files in the file browser, so that I can add several references at once
12. As a user, I want to see copied files and references in the file selector dropdown, so that all ticket-related files are in one place
13. As a user, I want referenced files to show a REFERENCE marker in the dropdown, so that I can distinguish them from copied files
14. As a user, I want to see an image preview when I select an image file (png, jpg, gif, webp, svg), so that I can view screenshots and diagrams inline
15. As a user, I want to see the markdown editor when I select a text or markdown file, so that I can read the content
16. As a user, I want referenced text files to be read-only in the editor, so that I don't accidentally modify source files
17. As a user, I want to see "Unable to show" when I select a binary or unsupported file, so that I know the file exists but can't be previewed
18. As a user, I want to delete a copied file using the existing trash button with confirmation, so that I can clean up attachments
19. As a user, I want to remove a reference using the existing trash button without confirmation, so that I can quickly detach files without deleting anything
20. As a user, I want to see a warning icon on referenced files that no longer exist on disk, so that I know a reference is stale
21. As a user, I want the "New markdown file" action extracted as a button next to the drop and reference buttons, so that all file actions are grouped together
22. As a user on macOS, I want the same file attachment and reference features to work, so that the tool is cross-platform

## Implementation Decisions

### Modules

Six modules to build or modify:

1. TicketStore extensions: new methods for copying uploaded files to the ticket folder, adding/removing references in status.json, listing all files in a ticket folder (not just .md), and reading arbitrary file content for preview. Extends the existing `requireContained()` security pattern to validate all paths. Auto-commits copied files to git.

2. Server-side file browser service: a new module that lists directory contents given an absolute path. Returns entries with name, type (file or directory), and size. Supports a flag to include or exclude hidden files (names starting with `.`). Starting directory defaults to `os.homedir()`. Navigation is unrestricted.

3. API routes: new endpoints following the existing `/api/projects/{slug}/board/tickets/{folderName}/...` pattern. Endpoints for file upload (POST, multipart), file deletion (DELETE), file content serving (GET, for images and text preview), and directory listing (GET, for the file browser).

4. File browser dialog component: a new SolidJS modal with directory navigation (clickable folders, breadcrumb or parent navigation), multi-select checkboxes for files, a toggle for hidden files, and confirm/cancel buttons. Returns an array of selected absolute paths.

5. TicketDetailDialog modifications: extract "New markdown file..." from the dropdown into a button. Add "Drop a file to copy" button (drop target with drag-over highlight + click fallback via hidden input[type=file]) and "Choose a file for reference" button. These three buttons form a row below the file selector dropdown, above the editor. Extend the file selector dropdown to list all file types. Add REFERENCE marker and missing-file warning icon rendering. Add image preview panel and "unable to show" panel as alternatives to the markdown editor based on selected file type.

6. StatusJson and TicketInfo type extensions: add `references?: { path: string }[]` to StatusJson. Add corresponding field to TicketInfo so references are available on the client.

### File storage

- Copied files are stored flat in the ticket folder root, alongside status.json and stage markdowns
- File references are stored in status.json as: `"references": [{ "path": "/absolute/path" }]`
- Only the path is stored per reference; filename and metadata are derived at read time

### Overwrite and size rules

- Dropping a file that matches an existing filename shows a confirmation dialog
- status.json is always protected: drops with that name are rejected
- Stage markdown files (.md) can be overwritten with confirmation
- Files larger than 10 KB trigger a size warning confirmation; user can proceed or cancel (not a hard block)

### File viewer behavior

- Text and markdown files: CodeMirror editor (read-only for references)
- Image files (png, jpg, gif, webp, svg): image element with the file served from an API route
- All other files: static "Unable to show" message

### Delete/remove behavior

- Copied files: existing trash button deletes the file from disk, with confirmation dialog
- Referenced files: same trash button removes the entry from status.json references array, no confirmation needed

### Stale references

- On load, check whether each referenced path exists on disk
- Missing references remain in status.json and display with a warning icon in the dropdown

### Cross-platform

- Use `path.join()` and `path.resolve()` for all path construction
- Use `os.homedir()` for the file browser starting directory
- Never hardcode path separators

### Drag-and-drop approach

- Use native HTML5 drag-and-drop API (dragover, dragleave, drop events) for file drops
- Do not use @thisbeyond/solid-dnd (that library is for sortable item reordering, not file drops)
- Read dropped files via DataTransfer API, send content to server as multipart upload

## Testing Decisions

Tests should verify external behavior (what the user sees and what gets persisted), not implementation details. Max 2 tests per module.

### TicketStore extensions (unit tests)
- Copying a file writes it to the ticket folder and the file can be read back
- Adding a reference persists it in status.json and removing it clears it

### Server-side file browser service (unit tests)
- Listing a directory returns correct entries with types and sizes
- Hidden files are excluded by default and included when the flag is set

### API routes (integration tests)
- Uploading a file via POST stores it in the ticket folder and returns success
- GET for a referenced file that doesn't exist returns an appropriate error

### File browser dialog (e2e with Playwright)
- Navigating into a subdirectory updates the file list
- Selecting multiple files and confirming returns all selected paths

### TicketDetailDialog modifications (e2e with Playwright)
- Dropping a file onto the copy button adds it to the dropdown and it can be selected
- Selecting a referenced image file shows the image preview instead of the editor

### Mock boundaries for e2e
- Mock filesystem calls and process calls only
- Use Playwright for all UI interaction and assertions

## Out of Scope

- Drag-and-drop for references (browser security prevents access to absolute paths)
- Editing referenced files (they are read-only)
- Folder references (only individual files)
- File search or filtering within the dropdown
- Thumbnail generation for images
- File size limits as hard blocks (only warnings)
- Syncing or watching referenced files for external changes beyond existence checks

## Further Notes

- The file browser is a server-side component because the browser's File System Access API does not expose absolute paths, which are required for references
- The git auto-commit pattern used by stage markdowns should extend to copied files
- The `requireContained()` security pattern must be applied to all file write operations to prevent path traversal
- Referenced file reads must also validate paths to prevent serving arbitrary system files; consider restricting to known safe content types for preview
