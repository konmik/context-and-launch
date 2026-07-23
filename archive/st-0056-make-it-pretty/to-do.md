# Goal

I want a sleek modern hacker design. I want to completely restyle the design of the app - every screen, window, ui element, icon and dialog. I want design to be elegant but non-intrusive.

## Details

TUI-inspired dev tool aesthetic:

Dark muted palette
Monospace font for headings and UI elements (JetBrains Mono)
Clean sans-serif for body text (Inter)
Thin 1px borders as structural dividers — no shadows, no gradients
Terminal conventions in UI: / search prefix, # section markers, code-style labels
Generous whitespace, content-dense but visually calm
Theme switching based on popular editor palettes (catppuccin, tokyo night, dracula, nord, gruvbox)

Layout tips:

Layout system:

Max width: 1160px (--max), centered with margin: 0 auto
Page padding: 1.25rem inline on desktop, 1rem on mobile (<720px)
Hero: 50/50 two-column grid (1fr 1fr), stacks to single column at 980px. Left side padded 4rem 3rem 4rem 2.5rem, right side 3rem 2.5rem
Sections: 5rem top/bottom padding, separated by 1px solid var(--line) border-top. Drops to 3rem on mobile

Grid patterns (all use 0.75rem gap):

4-column: pillar cards
3-column: feature cards, access cards, plugin marketplace chips, community videos
2-column: capability cards (nested), differ cards
Everything collapses to 1-column on mobile (<720px)

Card spacing:

Card padding: 1.1rem to 1.25rem
Minimum card heights: pillar 220px, access 340px, contrast 140px — all removed on mobile
Border radius: 6px (lg), 4px (md), 2px (sm) — deliberately tight, not rounded

Typography spacing:

Section headings: margin-bottom: 1.75rem
Lede paragraphs: margin-top: 1.25rem
Body line-height: 1.65, headings: 1.05
Hero h1: fluid clamp(2.6rem, 5.5vw, 4.6rem), section h2: clamp(1.8rem, 4vw, 3.2rem)

Key pattern: everything is structurally divided by 1px borders, not whitespace alone. Nav, hero, sections, cards — borders do the work that padding gaps usually do. The spacing itself is modest (~1rem card padding, ~5rem section rhythm) — the borders make it feel more structured than the padding alone would suggest.

