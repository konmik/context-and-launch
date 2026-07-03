# PRD: Add regenerate ticket number button

## Problem Statement

On the create-ticket dialog the ticket number is suggested only once, when the dialog opens, using the prefix of the most recently created ticket. If the user edits the number field to use a different prefix (for example changing ST to BUG), there is no way to get a suggested number for that prefix. The user has to know or look up the next free number manually.

## Solution

Add a small regenerate icon button next to the ticket number input in the create-ticket dialog. Clicking it reads the prefix the user has typed into the number field, asks the server for the next free number for that prefix (scanning both active and archived tickets), and replaces the field value with the result. The field remains freely editable; the button is a convenience, not the only way to set the number.

Behavior details, from the user's perspective:

- Clicking the button overwrites the current field value silently. Regeneration is an explicit action and is trivially repeatable, so no confirmation is shown.
- The prefix is parsed leniently from the current field value: the leading letters are taken and uppercased. "BUG", "BUG-", "BUG-7", and "bug" all yield the prefix BUG.
- If the field is empty (no letters to parse), the button falls back to the default suggestion: the most recently created ticket's prefix with its highest number plus one, exactly like the dialog-open prefill.
- If no ticket with the requested prefix exists anywhere (active or archive), the generated number starts at 1 with four-digit zero padding (for example BUG-0001).
- If tickets with the prefix exist, the result is the highest existing number plus one, keeping the padding width of the highest-numbered ticket.
- The button is disabled while a generation request is in flight. Its label/icon does not change while running.
- The existing one-shot prefill on dialog open is unchanged.

## Implementation Decisions

- The pure ticket-number module is generalized rather than special-cased: the existing next-number suggestion function accepts an optional prefix parameter. Without a prefix it keeps its current behavior (most recently created ticket's prefix); with a prefix it computes highest+1 among tickets with that prefix, or number 1 with padding width 4 when none exist.
- A new pure helper extracts a prefix from raw user input leniently: leading ASCII letters, uppercased; returns null when the input contains no leading letters.
- The ticket store exposes the suggestion with an optional prefix argument, passing through to the pure module over the full ticket list including the archive.
- A new server function (use server directive, colocated with the ticket feature API) takes the project slug and the raw field value, extracts the prefix, and returns the suggested number string. Generation runs server-side because archived tickets are not part of the client page data.
- This is an on-demand, button-triggered read, not a page-load read, so it is invoked directly rather than through query()/createAsync. It is a local Electron app; no dedicated failure UI is designed for this call.
- The create-ticket controller gains a regenerate command holding an in-flight signal; the dialog button binds its disabled state to that signal and to nothing else.
- The button uses the existing btn-icon styling with an inline refresh SVG, placed adjacent to the number input inside the create-ticket dialog.
- The number input stays a single free-text field; no separate prefix input is introduced.

## Out of Scope

- Automatic regeneration when the field value changes (button-only trigger).
- Making the number field read-only or validated against duplicates on generation; race collisions between concurrent sessions are not addressed.
- Any change to how the initial suggestion is computed at page load or prefilled at dialog open.
- Changes to status.json or ticket workflow states.

## Further Notes

Tests: unit tests for the pure ticket-number functions (lenient prefix extraction, new-prefix padding, highest-plus-one with mixed prefixes and archive tickets) and one e2e test that opens the create-ticket dialog, types a different prefix, clicks the regenerate button, and asserts the field contains the expected number for a repo with known tickets.
