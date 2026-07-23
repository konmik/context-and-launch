# Implementation plan: Make it pretty (ST-0056)

Companion to `product-requirement-document.md`. Phases are ordered so the app builds and `npm run test:all` stays green after every phase. Each phase ends in one or more small commits.

## Current-state anchors (verified in code)

- `src/app.css` is the single global stylesheet: font imports, `@theme inline` mapping, `:root` / `.dark` token blocks, Ark UI `[data-scope][data-part]` styling, `.btn-*` / `.input` classes, `.ripple-effect`.
- Radius tokens already match the target scale: `--radius: 0.375rem` (6px) with md = 4px, sm = 2px. No radius change needed, only enforcement (no `rounded-full` pills etc. except where genuinely circular).
- Mode logic: `src/components/shared/ThemeToggle.tsx` (applies `.dark`, writes `localStorage.theme`), `theme-toggle-pure.ts` (`getStoredTheme`), FOUC script in `src/entry-server.tsx`.
- ThemeToggle is rendered in `src/routes/project/[projectSlug].tsx` (line ~189) and `src/routes/add-project.tsx`. Check `src/routes/index.tsx` header while implementing.
- Ripple: `src/lib/ripple.ts`, wired in `src/app.tsx`, class hooks `ripple` on `TicketCard.tsx` and the project-header menu trigger, plus auto-attach to `.btn-*` selectors.
- Electron: `electron/main.ts` has `DARK_BG = "#17171a"` / `LIGHT_BG = "#ffffff"`, `backgroundColor()` chosen by `nativeTheme.shouldUseDarkColors`, re-applied on `nativeTheme.on("updated")`. No preload script and no IPC bridge exist today.
- Fonts: Inter 400/600/700 imported in `app.css`; JetBrains Mono 400/700 imported only in `MarkdownEditor.tsx`.

## Phase 1: Palette infrastructure

Goal: five palettes x two modes work end to end with Tokyo Night as default. Visuals otherwise unchanged.

1.1 Token sets in `src/app.css`
- Replace the current `:root` and `.dark` values with Tokyo Night Day / Tokyo Night Night mapped onto the existing semantic vars (`--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`, `--input`, `--ring`).
- `:root` holds the default palette's light values, `.dark` its dark values, so a missing `data-palette` attribute renders Tokyo Night correctly.
- Add four override blocks per remaining palette: `[data-palette="catppuccin"] { ... }` and `[data-palette="catppuccin"].dark { ... }` (Latte / Mocha), same for `dracula` (Alucard / Dracula), `nord` (Snow Storm / Polar Night), `gruvbox` (Light / Dark).
- Source values from the official published palettes. Convert to oklch to match the existing file. Keep chroma muted for chrome roles (background, card, border); accents carry the palette identity.
- The old neutral shadcn values are deleted.

1.2 Palette module `src/components/shared/palette-pure.ts`
- `export const PALETTES = ["tokyo-night", "catppuccin", "dracula", "nord", "gruvbox"] as const;`
- `export type PaletteName = (typeof PALETTES)[number];`
- `export const DEFAULT_PALETTE: PaletteName = "tokyo-night";`
- `getStoredPalette(storage): PaletteName` - reads `localStorage.palette`, validates against `PALETTES`, returns `DEFAULT_PALETTE` for missing or unknown values (documented product default, not an error path).
- Unit tests mirroring `theme-toggle-pure.test.ts`: stored valid value, stored garbage, storage throwing, nothing stored.

1.3 PalettePicker component `src/components/shared/PalettePicker.tsx`
- Ark UI menu (reuse `ui/menu.tsx` primitives) rendered next to ThemeToggle everywhere ThemeToggle appears.
- Trigger: mono code-style label `theme: {active}` with `data-testid="palette-picker-trigger"`.
- Items: the five palettes, active one marked, `data-testid="palette-picker-item-{name}"`.
- Selecting: sets `document.documentElement.dataset.palette`, writes `localStorage.palette`, notifies Electron (phase 5 hook, no-op in browser).
- New testids must satisfy the `scripts/testid-coverage.ts` gate.

1.4 FOUC script in `src/entry-server.tsx`
- Extend the inline script: read `localStorage.palette`, validate against the literal palette list, set `document.documentElement.dataset.palette` before paint. Keep the existing dark-mode logic untouched.

1.5 e2e `e2e/palette-picker.test.ts`
- Select a palette; assert `documentElement` gets `data-palette`; reload; assert it persists; toggle dark mode; assert both `data-palette` and `.dark` coexist and tokens change (spot-check one computed color differs between two palettes).
- Uses the real-server harness like `e2e/add-project.test.ts`.

Commits: token sets; palette module + picker + FOUC; e2e.

## Phase 2: Design language on shared primitives

Goal: the global look (borders, type, feedback) lands once in `app.css` and shared classes; every surface consuming them updates for free.

2.1 Typography
- Move `@fontsource/jetbrains-mono/400.css` and `/700.css` imports from `MarkdownEditor.tsx` to the top of `app.css`.
- Add to `@layer base`: headings (h1-h4), buttons, labels, and a new utility class `.label-mono` (JetBrains Mono, slightly reduced size, optional letter-spacing) for metadata labels.
- Body stays Inter. Line-heights: body 1.65, headings 1.05.

2.2 Borders as structure, kill shadows
- Remove all `box-shadow` declarations (dialog content, menu content, floating panel) and rely on `1px solid var(--border)`; dialog backdrop stays but darkens/desaturates per palette (keep `rgb(0 0 0 / 0.5)` or a token-driven overlay).
- Audit `app.css` and shared classes for gradients (none expected) and shadows (three occurrences found).

2.3 Interaction feedback
- Delete `.ripple-effect` and `@keyframes ripple-expand` from `app.css`, delete `src/lib/ripple.ts`, remove `initRipple` import/call from `src/app.tsx`, remove `ripple` class from `TicketCard.tsx` and the project-header menu trigger.
- Add to `.btn-primary/.btn-secondary/.btn-destructive/.btn-icon` and menu/tab triggers: `:active` background shift (instant, or transition <= 80ms), hover as discrete background/border swap (drop opacity-based hover on primary/destructive in favor of a pre-derived hover token or color-mix), and a visible `:focus-visible` outline (1px solid `var(--ring)`, offset 1px) replacing the current global `outline: none`.
- Keep the global `outline: none` only for plain `:focus`; `:focus-visible` must be visible everywhere.

2.4 Shared class polish
- `.btn-*`, `.input`: mono font, tightened padding per PRD (cards/dialogs 1.1-1.25rem), 1px borders on all button variants (primary gets a border in its own color family so heights align).
- Ark dialog/menu/tabs/floating-panel blocks: mono titles, 1px borders, no shadow, spacing per design language.

Commits: typography; shadows-to-borders; ripple removal + feedback states; shared class polish.

## Phase 3: Icon migration to lucide-solid

- `npm install lucide-solid@<exact version>` (pinned, no caret).
- Replace hand-authored inline SVGs file by file (14 files, ~35 icons): `ThemeToggle.tsx` (Sun/Moon), `ticket/ticket-detail-parts.tsx` (6), `routes/project/[projectSlug].tsx` (8), `shared/LogViewerDialog.tsx` (3), `ticket/TicketDetailDialog.tsx` (3), plus board/forest/launcher call sites (locate with a `<svg` grep).
- Uniform sizing: `size={16}` inline contexts, `size={20}` toolbar contexts; default stroke width; `currentColor` inherited.
- `HerdrStatusIcon`: keep its status semantics; swap paths for lucide equivalents; update `HerdrStatusIcon.test.tsx` only if markup changes.
- Acceptance: `grep -r "<svg" src/` returns nothing outside generated or third-party content.

Commit: one mechanical commit (or two: shared components, then routes).

## Phase 4: Per-surface polish

Apply design language and cosmetic terminal conventions surface by surface. No behavior changes; testids untouched.

4.1 Index and add-project (`src/routes/index.tsx`, `add-project.tsx`, `project/AddProjectForm.tsx`)
- Centered content column (max-width ~72rem, margin auto, 1.25rem inline padding).
- `#` markers on page headings; mono labels for paths/slugs; terminal-flavored empty state on the project list.

4.2 Project board (`src/routes/project/[projectSlug].tsx`, `board/KanbanBoard.tsx`, `board/kanban-columns.tsx`, `ticket/TicketCard.tsx`)
- Header: 1px bottom border, mono project name and controls, palette picker + theme toggle grouped.
- Columns: separated by 1px borders instead of gap/background contrast; mono column titles with ticket counts as code-style labels (`todo [4]` style); column description in muted Inter.
- Cards: 1px border, tight radius, mono ticket number and metadata line, Inter title/description; hover = border emphasis + background shift, no shadow or scale.
- Convert the ~7 hardcoded palette classes found in `[projectSlug].tsx`, `ui/floating-panel.tsx`, `launcher-settings-dialogs.tsx`, `launcher-settings-command-templates-tab.tsx`, `launcher-settings-rows.tsx` to semantic tokens.

4.3 Forest view (`forest/ForestView.tsx`, `ForestSurface.tsx`, `ForestCard.tsx`, `ForestDependencyEdge.tsx`)
- Cards match kanban card styling; edges use `var(--border)` / `var(--muted-foreground)`; group frames as 1px borders with mono group labels.
- Keep the existing solid-flow layer ordering; no z-index additions.

4.4 Dialogs (`ticket/TicketDetailDialog.tsx` + tabs + `ticket-detail-parts.tsx`, `CreateTicketDialog`, `EditTicketDialog`, `DeleteProjectDialog`, `ConflictDialog`, `ErrorDialog`, `LogViewerDialog`, `TicketCleanupDialog`)
- Mostly inherited from phase 2 Ark styling. Per-dialog pass: mono titles with `#` marker, mono field labels, code-style metadata (`branch: st-0056`, `status: in-progress`), terminal-flavored placeholders.
- LogViewer: mono body is already natural here; ensure it reads tokens.

4.5 Launcher settings (`launcher/LauncherSettings.tsx`, all `launcher-settings-*` tabs, dialogs, rows)
- Tab labels mono (inherited); rows separated by 1px borders; inputs/selects via `.input`.

4.6 Floating panel (herdr ticket panes, `ui/floating-panel.tsx`)
- Inherited from phase 2; verify drag/resize affordances remain visible with border-only styling.

Commits: one per surface group (4.1-4.6).

## Phase 5: Markdown editor and Electron background sync

5.1 CodeMirror (`shared/MarkdownEditor.tsx`)
- Editor chrome via `EditorView.theme`: background `var(--background)`, text `var(--foreground)`, gutter `var(--muted-foreground)` on `var(--background)`, selection `var(--accent)`, cursor `var(--primary)`. CSS vars are valid values inside CM themes, so one theme serves all palettes.
- One `HighlightStyle` for markdown: heading = `var(--primary)` + mono bold, link = `var(--ring)` underlined, inline code/code block = `var(--muted-foreground)` on `var(--muted)`, emphasis kept subtle. No per-palette highlight styles.

5.2 Electron window background (`electron/main.ts`, new preload)
- Add `electron/palette-backgrounds.ts`: map `PaletteName -> { light: string; dark: string }` background hexes matching the phase 1 token sets (single source: derive both this file and the CSS from one checked-in table to avoid drift; a unit test asserts the map covers all PALETTES).
- Add a minimal preload script exposing `setPalette(name)` via `contextBridge`; wire `webPreferences.preload`.
- Renderer: PalettePicker and startup code call `window.contextLaunch?.setPalette(...)` when running in Electron.
- Main: on `setPalette`, store the palette name in the existing `window-state.json` payload (extend `WindowStateEntry` bookkeeping with one app-level field), apply `win.setBackgroundColor` to all windows, and use the stored palette in `backgroundColor()` for both `nativeTheme` updates and new-window creation. Replace `DARK_BG`/`LIGHT_BG` constants with lookups; a missing stored palette uses `DEFAULT_PALETTE`.
- Keep `nativeTheme.on("updated")` behavior; it now resolves through the palette map.

Commits: editor; electron sync.

## Phase 6: Verification and cleanup

- Favicon check: view `public/favicon.svg` against the new aesthetic; minimal recolor only if it clashes. `build-resources/icon.png` untouched.
- Sweep: `grep` for `ripple`, `box-shadow`, `<svg`, hardcoded Tailwind palette classes (`bg-red-`, `text-gray-`, `bg-white`, `text-black`), leftover `Inter` on structural elements.
- Run `npm run test:all`. Expected touch points: none in `status-swatch.test.ts` (column colors untouched), none in `.dark` toggle assertions (mechanism unchanged), possibly `HerdrStatusIcon.test.tsx` (phase 3).
- Screenshot checklist (review artifact): index, add-project, board, forest view, ticket detail dialog, launcher settings, floating panel - each in Tokyo Night dark and Catppuccin Latte light. Capture via playwright against the dev server.

## Test matrix summary

- New: `palette-pure.test.ts` (unit), `e2e/palette-picker.test.ts` (e2e), palette-backgrounds map unit test.
- Updated only if markup changes: `HerdrStatusIcon.test.tsx`.
- Must pass unchanged: `e2e/status-swatch.test.ts`, `e2e/add-project.test.ts`, `e2e/project-header.test.ts`, full remaining suite via `npm run test:all` after every phase.

## Ordering rationale and risks

- Phase 1 before 2 so every visual decision is made against the real default palette, not the deleted shadcn one.
- Phase 2 before 4 so surface passes are mostly deletions of local styling in favor of shared classes.
- Icons (phase 3) are independent; scheduled before per-surface polish so surface commits do not mix mechanical SVG swaps with styling.
- Largest risks: contrast regressions across 10 token sets (mitigate with the two-extreme screenshot checklist plus spot checks of `--muted-foreground` on `--background` in every set), and the Electron preload addition (keep it to one exposed function; contextIsolation stays on).
- Focus-visible restyle touches a global reset; verify keyboard traversal on dialogs and menus in the screenshot pass.
