# Herdr agent status icons, glyphs, and colors

Research notes on exactly how the herdr TUI renders agent status (idle, working, blocked, done, unknown).
Sources are herdr's own source code (primary sources only). Verified against the `master` tree
at commit `952729ee03e0939d7a9d893f87f24179cf0eb7cb` (fetched 2026-08-13).

Repo: <https://github.com/ogulcancelik/herdr> (redirects to `herdrdev/herdr`; the project moved orgs).
Herdr is **Rust** (ratatui TUI).

## Where herdr renders status

Canonical rendering lives in `src/ui/status.rs`:

- `state_icon_symbol(state, seen, indicator_style)` — the glyph.
- `state_label_color(state, seen, palette)` — the foreground color.
- `state_icon(state, seen, indicator_style, palette)` — returns `(glyph, Style::fg(color))`.
- `state_label(state, seen)` — the text label ("working", "blocked", "done", "idle"; `Unknown` is labeled `"idle"`).

The icon is used in the sidebar workspace list and agent panel (`src/ui/sidebar.rs`,
which imports `state_icon`/`state_label`/`state_label_color` from `src/ui/status.rs`).
Default sidebar row layouts put the icon first: `src/config/sidebar.rs`
(`AgentsSidebarConfig::default()` rows `[[StateIcon, Workspace, Tab], [Agent]]`;
`SpacesSidebarConfig::default()` rows `[[StateIcon, Workspace], [Branch, GitStatus]]`).

The tab bar (`src/ui/tabs.rs`) and pane borders (`src/ui/panes.rs`) do **not** render
status glyphs at all.

## The status model

- `AgentState` is `Working | Blocked | Idle | Unknown` (`src/detect/mod.rs`, used in
  `src/ui/status.rs`).
- There is no `Done` variant in the state machine. `done` vs `idle` is derived from a
  `seen: bool` flag on top of `Idle`:
  - `Idle` + **not** seen = **done** ("the same underlying idle state after unseen
    background work finishes"; `SKILL.md`, <https://github.com/herdrdev/herdr/blob/master/SKILL.md>).
  - `Idle` + seen = **idle**.
- Same mapping in `src/ui/sidebar.rs`:

  ```rust
  pub(super) fn agent_panel_status_key(state: AgentState, seen: bool) -> &'static str {
      match (state, seen) {
          (AgentState::Idle, false) => "done",
          (AgentState::Idle, true) => "idle",
          (AgentState::Working, _) => "working",
          (AgentState::Blocked, _) => "blocked",
          (AgentState::Unknown, _) => "unknown",
      }
  }
  ```

## Exact glyphs (two styles)

`src/ui/status.rs`, `state_icon_symbol`:

```rust
match (indicator_style, state, seen) {
    (StatusIndicatorStyle::Dots, AgentState::Blocked, _) => "●",
    (StatusIndicatorStyle::Dots, AgentState::Working, _) => "●",
    (StatusIndicatorStyle::Dots, AgentState::Idle, false) => "●", // done
    (StatusIndicatorStyle::Dots, AgentState::Idle, true) => "○",  // idle
    (StatusIndicatorStyle::Dots, AgentState::Unknown, _) => "·",
    (StatusIndicatorStyle::Symbols, AgentState::Blocked, _) => "×",
    (StatusIndicatorStyle::Symbols, AgentState::Working, _) => "◐",
    (StatusIndicatorStyle::Symbols, AgentState::Idle, false) => "✓", // done
    (StatusIndicatorStyle::Symbols, AgentState::Idle, true) => "○",  // idle
    (StatusIndicatorStyle::Symbols, AgentState::Unknown, _) => "·",
}
```

The style is configurable via `ui.status_indicators = "dots" | "symbols"`
(`src/config/model.rs`, `StatusIndicatorStyle`), and the **default is `Dots`**:

```rust
#[derive(..., Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StatusIndicatorStyle {
    #[default]
    Dots,
    Symbols,
}
```

`UiConfig::default()` sets `status_indicators: StatusIndicatorStyle::Dots`.

A unit test in `src/ui/status.rs` locks this in
(`state_icons_support_dot_and_distinct_symbol_styles`): expected symbol arrays are
`["●", "●", "●", "○", "·"]` (dots) and `["×", "◐", "✓", "○", "·"]` (symbols)
for blocked / working / done / idle / unknown, and every glyph is asserted to be
`display_width == 1` (single cell, static).

**There is no animation.** Working is a static glyph in both styles. Herdr never draws a
braille spinner; braille characters that appear in herdr's pane titles come from the
agent TUI running inside the pane (e.g. claude/pi's own spinner leaked into the terminal
title — see the test data `"⠋ raw title"` in `src/ui/sidebar/tokens.rs`).

## Exact colors (default theme)

`src/ui/status.rs`, `state_label_color`:

```rust
match (state, seen) {
    (AgentState::Blocked, _) => p.red,
    (AgentState::Working, _) => p.yellow,
    (AgentState::Idle, false) => p.teal,   // done
    (AgentState::Idle, true) => p.green,   // idle
    (AgentState::Unknown, _) => p.overlay0,
}
```

Default theme is `catppuccin` (Catppuccin Mocha — `src/config/theme.rs` names it the
fallback/default; `Palette::catppuccin()` in `src/app/state.rs`):

| Palette token | RGB                | Hex       |
| ------------- | ------------------ | --------- |
| red (blocked) | Rgb(243, 139, 168) | `#f38ba8` |
| yellow (working) | Rgb(249, 226, 175) | `#f9e2af` |
| teal (done)   | Rgb(148, 226, 213) | `#94e2d5` |
| green (idle)  | Rgb(166, 227, 161) | `#a6e3a1` |
| overlay0 (unknown) | Rgb(108, 112, 134) | `#6c7086` |

The icon is drawn with `Style::default().fg(<that color>)` — colored foreground,
no bold, no dim on the icon itself (`src/ui/status.rs`, `state_icon`). The *text label*
next to it additionally gets `Modifier::DIM` in the workspace list
(`src/ui/sidebar.rs`, `state_text_style`). The separator after the icon is a single
space, other tokens are joined with `" · "` (`src/ui/sidebar/tokens.rs`, `separator`).

## Summary table (herdr vs this app)

| Status | Herdr glyph (default "dots") | Herdr glyph ("symbols") | Herdr color (catppuccin) |
| ------ | ---------------------------- | ----------------------- | ------------------------ |
| working | `●` (static) | `◐` (static) | `#f9e2af` yellow |
| blocked | `●` | `×` | `#f38ba8` red |
| done | `●` | `✓` | `#94e2d5` teal |
| idle | `○` | `○` | `#a6e3a1` green |
| unknown | `·` | `·` | `#6c7086` overlay0 |

## Decision

`src/components/ticket/HerdrStatusIcon.tsx` (the single component used by TicketCard,
ForestCard, and DiffReview) renders herdr's **default dots style** with the exact
catppuccin colors above, and every glyph is static. Earlier revisions had drifted:
an animated braille spinner for working (herdr has no animation), `◉` for blocked
(nowhere in herdr), `✓` for idle (herdr's symbols-mode done), and `○` for unknown
(herdr's idle). Colors always matched herdr.

Consequence of dots style: working, blocked, and done share the `●` glyph and differ
only by color — exactly as herdr renders them out of the box. If herdr is configured
with `ui.status_indicators = "symbols"`, the glyph map in `HerdrStatusIcon.tsx` can be
switched to `×` / `◐` / `✓` / `○` / `·`.

## Source citations

- Glyphs, colors, labels: `src/ui/status.rs`
  (`state_icon_symbol`, `state_icon`, `state_label`, `state_label_color`),
  <https://github.com/herdrdev/herdr/blob/master/src/ui/status.rs>
- Default indicator style: `src/config/model.rs`
  (`StatusIndicatorStyle`, `UiConfig::default`),
  <https://github.com/herdrdev/herdr/blob/master/src/config/model.rs>
- Default theme name: `src/config/theme.rs` (`ThemeConfig::diagnostics` fallback "catppuccin"),
  <https://github.com/herdrdev/herdr/blob/master/src/config/theme.rs>
- Palette RGB values: `src/app/state.rs` (`Palette::catppuccin`),
  <https://github.com/herdrdev/herdr/blob/master/src/app/state.rs>
- Usage in sidebar / status-key mapping: `src/ui/sidebar.rs`,
  <https://github.com/herdrdev/herdr/blob/master/src/ui/sidebar.rs>
- Default sidebar row layouts: `src/config/sidebar.rs`,
  <https://github.com/herdrdev/herdr/blob/master/src/config/sidebar.rs>
- No status glyphs in tab bar / pane borders: `src/ui/tabs.rs`, `src/ui/panes.rs`.
- idle/done/unknown semantics: `SKILL.md`,
  <https://github.com/herdrdev/herdr/blob/master/SKILL.md>
