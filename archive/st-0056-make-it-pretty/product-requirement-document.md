# PRD: Make it pretty (ST-0056)

## Goal

Restyle the entire app into a sleek, modern, TUI-inspired dev tool aesthetic: dark muted palettes, monospace structure, 1px borders as structural dividers, calm density. Add switchable color palettes based on popular editor themes. Elegant but non-intrusive.

This is a pure restyle. No behavior changes, no new features, no user-data changes.

## Background (current state)

- Tailwind CSS v4 via Vite plugin, no tailwind config file. All global styling in `src/app.css`.
- Mature shadcn-style token system: oklch CSS variables (`--background`, `--card`, `--primary`, `--muted`, `--accent`, `--destructive`, `--border`, `--ring`, ...) mapped through `@theme inline`.
- Class-based light/dark mode (`.dark` on `documentElement`), localStorage persistence, system-preference fallback, FOUC-prevention inline script in `src/entry-server.tsx`, Electron `nativeTheme` and window `backgroundColor` sync.
- ~115 semantic token usages across 31 tsx files; only ~7 hardcoded palette classes remain.
- Fonts: Inter global (`@fontsource/inter`); JetBrains Mono loaded only inside `MarkdownEditor.tsx`.
- Icons: ~35 hand-authored inline SVGs (lucide-style) across 14 files, no shared component.
- Shared classes in `app.css`: `.btn-primary`, `.btn-secondary`, `.btn-destructive`, `.btn-sm`, `.btn-icon`, `.input`, `.input-sm`, `.ripple-effect`.
- Ark UI dialogs, menus, tabs, floating panels styled centrally via `[data-scope][data-part]` selectors.
- Native Electron window frame, `autoHideMenuBar`, no custom titlebar.

## Requirements

### 1. Theme system: Palette x Mode

- Two orthogonal axes:
  - Palette: one of five families - Catppuccin, Tokyo Night, Dracula, Nord, Gruvbox.
  - Mode: light or dark. The existing mechanism (`.dark` class, localStorage key, system-preference fallback, sun/moon toggle) is preserved unchanged.
- Each Palette defines a complete token set for both Modes, sourced from the official published palettes:
  - Catppuccin: Latte (light) / Mocha (dark)
  - Tokyo Night: Day (light) / Night (dark)
  - Dracula: Alucard (light) / Dracula (dark)
  - Nord: Snow Storm base (light) / Polar Night base (dark)
  - Gruvbox: Light / Dark
- 10 token sets total. Each maps its palette values onto the existing semantic tokens (`--background`, `--card`, `--primary`, etc.). Components keep consuming semantic tokens; no per-component palette logic.
- The palette is applied as an attribute or class on `documentElement` alongside `.dark` (e.g. `data-palette="tokyo-night"`).
- Default palette: Tokyo Night. The current neutral shadcn palette is deleted, not kept as a sixth option. Existing users wake up in Tokyo Night with their light/dark preference respected.
- Persistence: global (app-wide, all project windows), stored in localStorage alongside the existing theme key. No per-project palettes.
- The FOUC-prevention inline script is extended to apply the persisted palette before first paint.
- Electron window `backgroundColor` sync extends to the selected palette so window spawn and resize never flash a wrong color.

### 2. Palette picker

- A dropdown (Ark UI menu) in the app header, next to the existing sun/moon toggle, present wherever the toggle is present.
- Lists the five palettes; the active one is marked. Label styled as a code-style mono label (e.g. `theme: tokyo-night`).
- Selecting a palette applies it immediately and persists it.
- The sun/moon toggle remains a separate control and keeps its current behavior.

### 3. Design language

Extracted from the to-do's inspiration material and translated to this app's surfaces. The to-do's marketing-page layout specs (hero grids, 1160px sections, pillar cards) are inspiration, not literal requirements.

- Borders as structure: 1px solid borders (`--border`) divide regions - header from content, columns from each other, cards from background. No shadows, no gradients. Borders do the structural work; spacing stays modest.
- Radii: tight - 6px (lg), 4px (md), 2px (sm). Nothing pill-shaped or heavily rounded.
- Spacing: card padding around 1.1-1.25rem. Content-dense but visually calm. Generous whitespace where structure allows.
- Type scale: body line-height ~1.65, headings ~1.05. Headings sized with fluid clamp where a page-level heading exists.
- Dark muted palettes; nothing neon or high-saturation in the chrome. Accent colors come from the active palette.
- Full-viewport surfaces (kanban board, forest view) stay full-viewport. Content-like pages (index / project list, add-project) may use a centered max-width column.

### 4. Typography

- JetBrains Mono for structure: headings, buttons, tab labels, column titles, badges, metadata (ticket numbers, branch names, statuses, dates, counts), form labels, menu items, code-style labels.
- Inter for prose: ticket descriptions, rendered markdown, paragraph-length help text.
- JetBrains Mono import moves from `MarkdownEditor.tsx` to global `src/app.css`. Weights as needed (400/700, plus others only if used).

### 5. Terminal conventions (cosmetic only)

- `#` markers on section headings where appropriate.
- Code-style mono labels for metadata (e.g. `status: in-progress`, `branch: st-0056`).
- Terminal-flavored placeholder text and empty states, kept subtle and professional.
- No new functionality. Specifically: no `/` quick-search - that is a separate future ticket.

### 6. Icons

- Adopt `lucide-solid`, pinned exact version.
- Replace all hand-authored inline SVGs (~35 across 14 files) with lucide-solid icons at uniform sizes (16/20px) and stroke width, `currentColor`.
- No hand-authored SVG paths remain in components.

### 7. Interaction feedback

- Remove the ripple effect (`.ripple-effect`, `src/lib/ripple.ts`, wiring in `app.tsx`).
- Replace with instant, discrete state changes: background shift on `:active` (fast, ~80ms), hover background/border emphasis, clearly visible focus states. Feedback is state-swap, not animation - immediate and binary, matching the TUI idiom.

### 8. Markdown editor (CodeMirror)

- Editor chrome (background, text, gutter, selection, cursor) reads the app tokens so it matches the active Palette and Mode.
- One generic markdown syntax mapping onto the active palette's semantic accent tokens (e.g. heading = primary accent, link = secondary accent, inline code = muted mono block). No per-palette syntax themes.

### 9. Surfaces covered

Every screen, dialog, and element is restyled to the design language:

- Index (project list) and add-project pages - centered content column allowed.
- Project board: header/toolbar, kanban columns, ticket cards, status area.
- Forest view: surface, cards, edges, group frames.
- Ticket detail dialog: all tabs (editor, launcher, shortcuts).
- Create/edit ticket dialogs, delete project dialog, conflict dialog, error dialog, log viewer, ticket cleanup dialog.
- Launcher settings and all its tabs, settings dialogs and rows.
- Floating panels (herdr ticket panes).
- Shared primitives: buttons, inputs, menus, tabs, dialogs (the `.btn-*` / `.input` classes and Ark UI `[data-scope]` styling in `app.css`).
- The ~7 remaining hardcoded palette classes are converted to semantic tokens.

## Out of scope (non-goals)

- Any behavior change or new feature. In particular no `/` quick-search.
- Column Colors / Status Swatches: mechanism, preset choices, and stored user hex values are all untouched.
- Custom Electron window chrome / titlebar. Native frame stays.
- App/taskbar/installer icon (`build-resources/icon.png`). Exception: `public/favicon.svg` may get a minimal recolor if it clashes with the new aesthetic.
- Per-project palettes (possible follow-up).
- Semantic (per-palette) Column Colors with config migration (possible follow-up).
- Pixel-snapshot testing.

## Acceptance criteria

- One new playwright e2e for the palette picker: selecting a palette applies it to `documentElement`, persists across reload, and coexists correctly with the light/dark toggle.
- Existing e2e suite stays green without weakening:
  - `.dark` toggle tests pass unchanged (mechanism preserved).
  - `status-swatch.test.ts` passes unchanged (column colors untouched).
  - `HerdrStatusIcon.test.tsx` updated only if its markup changes.
- `npm run test:all` green (tsc + unit + build + e2e).
- No `.ripple-effect` or `src/lib/ripple.ts` remains.
- No hand-authored inline SVG icons remain in components.
- Review artifact: screenshot checklist covering index, add-project, board, forest view, ticket detail dialog, launcher settings, and a floating panel - each in at least Tokyo Night dark and Catppuccin Latte light.

## Risks / notes

- Deleting the old palette changes every user's visual baseline in one release; mitigated by respecting the existing Mode preference and choosing muted defaults.
- 10 token sets must each be checked for contrast on the same semantic roles; the screenshot checklist samples both extremes (darkest dark, lightest light).
- lucide-solid migration touches 14 files; keep it mechanical and separate from styling commits where practical.
