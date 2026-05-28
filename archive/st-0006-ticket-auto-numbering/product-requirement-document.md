# ST-0006: Ticket Auto-Numbering

## Problem Statement

When creating a new ticket, the user must manually type a ticket number every time. This is tedious and error-prone: the user has to remember the current prefix, figure out the next number in the sequence, and format it with the right zero-padding. Mistyped or duplicate numbers are easy to introduce.

## Solution

Auto-suggest the next ticket number when the user opens the Create Ticket dialog. The system scans all existing tickets (active and archived), finds the most recently created ticket's prefix, locates the highest number with that prefix, and pre-fills the Number field with the next value. The user can accept the suggestion or override it with any value they want.

When no existing ticket has a parseable PREFIX-ZEROPADDEDNUMBER format, the Number field is left empty for manual entry, preserving the current behavior for first-time or free-form use.

## User Stories

1. As a user creating a new ticket, I want the number field pre-filled with the next sequential number, so that I do not have to remember the current sequence.
2. As a user creating a new ticket, I want to override the suggested number, so that I can use a different prefix or number when needed.
3. As a user creating the first ticket in a project, I want the number field to be empty, so that I can establish the prefix and numbering convention myself.
4. As a user with tickets using the PREFIX-ZEROPADDEDNUMBER pattern, I want the suggested number to use the same prefix as my most recently created ticket, so that the numbering follows my current convention.
5. As a user with tickets using multiple prefixes, I want the system to pick the prefix from my most recently created ticket, so that it follows my latest intent rather than alphabetical order.
6. As a user who has archived tickets, I want archived ticket numbers to be considered when calculating the next number, so that numbers are never reused.
7. As a user with zero-padded numbers like ST-0006, I want the suggested next number to match the padding width (ST-0007, not ST-7), so that sorting and display remain consistent.
8. As a user whose tickets do not follow the PREFIX-NUMBER pattern (e.g. free-text numbers like "42" or "fix-login"), I want the number field left empty, so that I am not confused by a malformed suggestion.
9. As a user who overrides the suggested number with a higher value (e.g. ST-0010 instead of ST-0007), I want the next suggestion to be ST-0011, so that gaps do not cause collisions.
10. As a user who overrides with a new prefix (e.g. BUG-0001 when previous tickets were ST-xxxx), I want the next suggestion to use BUG as the prefix, so that auto-numbering follows my latest choice.
11. As a user with existing tickets that predate the createdAt field, I want auto-numbering to still work by treating those tickets as the oldest, so that the feature is backward-compatible.
12. As a user, I want the Create Ticket dialog to open quickly even when many tickets exist, so that the number suggestion does not introduce noticeable delay.

## Implementation Decisions

### Ticket number pattern

The canonical pattern is PREFIX-ZEROPADDEDNUMBER where:
- PREFIX is one or more uppercase letters (e.g. ST, BUG, PROJ)
- The separator is a single dash
- ZEROPADDEDNUMBER is one or more digits with leading zeros (e.g. 0006, 0012, 001)

A ticket number parser extracts `{ prefix, num, paddingWidth }` from a raw string, or returns null for non-conforming numbers.

### Next number algorithm

1. Collect all tickets (active and archived) with their number and createdAt fields.
2. Filter to those with parseable PREFIX-ZEROPADDEDNUMBER format.
3. If none are parseable, return null (no suggestion).
4. Find the most recently created parseable ticket (by createdAt). Use its prefix.
5. Among all parseable tickets sharing that prefix, find the highest numeric value.
6. The padding width matches the highest-numbered ticket with that prefix.
7. Return PREFIX-ZEROPADDEDNUMBER with num = highest + 1.

### StatusJson schema change

Add a `createdAt` field (ISO 8601 string) to StatusJson. Written by TicketStore.createTicket() at creation time. Existing tickets without this field are treated as the oldest (sorted before any ticket with a createdAt value) for backward compatibility.

### Archive scanning

TicketStore gains the ability to read ticket numbers from the archive directory. This is used only for the next-number calculation -- archived tickets remain hidden from the board and listTickets().

### Server data flow

The suggested next number is provided to the client alongside the board data. The loadBoard query (or a dedicated server action) computes and returns the suggestion so the CreateTicketDialog can pre-fill the field on open.

### CreateTicketDialog changes

- The Number field is pre-filled with the suggested next number when available.
- The field remains editable -- the user can clear it and type anything.
- When no suggestion is available (no parseable tickets), the field is empty, same as today.
- The placeholder text updates to reflect the auto-numbering pattern.

### Modules

1. Ticket number parser: pure function, no side effects, independently testable.
2. Next number suggester: pure function taking a list of `{ number, createdAt? }` entries, returning a suggested number string or null.
3. StatusJson schema: createdAt field added to the interface and written on creation.
4. TicketStore archive reader: reads ticket numbers from the archive directory for number calculation.
5. Server action / data flow: exposes the suggestion to the client.
6. CreateTicketDialog: pre-fills the Number field.

## Testing Decisions

Tests should verify external behavior through each module's public interface, not internal implementation details. The existing TicketStore test file (1300+ lines, Vitest) provides the pattern: temporary directories, git-initialized worktrees, and assertion on returned data.

Modules to test:

1. Ticket number parser: test parsing of valid patterns (ST-0006, BUG-0012, X-1), rejection of invalid patterns (42, fix-login, ST-, -0006, st-0006), and correct extraction of prefix, numeric value, and padding width.

2. Next number suggester: test the full algorithm with various inputs: single prefix, multiple prefixes, gaps in numbering, mixed parseable and unparseable tickets, all unparseable (returns null), no tickets (returns null), backward compatibility with missing createdAt fields, padding width inheritance.

3. StatusJson schema: test that createTicket writes createdAt and that existing tickets without createdAt are handled gracefully (no crashes, treated as oldest).

4. Archive scanning: test that archived ticket numbers are included in the highest-number calculation. Test with empty archive, populated archive, and mixed active/archived tickets.

5. Server action: test that the suggested number is returned correctly via the server action or loadBoard response.

6. CreateTicketDialog: test that the Number field is pre-filled when a suggestion exists, empty when not, and that user edits are preserved on submission.

Prior art: `src/server/ticket-store.test.ts` uses Vitest with tmpDir() helper, createGitWorktree() setup, afterEach cleanup, and assertion patterns like `expect(ticket.number).toBe(...)`.

## Out of Scope

- Enforcing the PREFIX-ZEROPADDEDNUMBER format (users can still enter any free-text number)
- Uniqueness validation (the system does not prevent duplicate numbers)
- Per-project prefix configuration (prefix is derived from existing tickets, not configured)
- Renumbering or migrating existing tickets to conform to the pattern
- Auto-numbering in ticket update/rename flows (only applies to creation)

## Further Notes

The CONTEXT.md glossary entry for "Ticket Number" has been updated to reflect the new auto-suggestion behavior. No ADR is needed -- this is a straightforward feature addition with no hard-to-reverse architectural tradeoff.
