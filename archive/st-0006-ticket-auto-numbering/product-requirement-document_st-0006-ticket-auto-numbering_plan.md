# Implementation Plan: ST-0006 Ticket Auto-Numbering

## Codebase Context

- Framework: SolidStart (SolidJS + Vinxi)
- Test framework: Vitest
- Server actions: src/server/actions.ts
- Data types: src/types.ts
- Ticket storage: src/server/ticket-store.ts (TicketStore class, StatusJson interface)
- UI: src/components/CreateTicketDialog.tsx
- Board loading: src/server/actions.ts loadBoard query returns BoardPageData
- Project page: src/routes/project/[slug].tsx

## Step 1: Create ticket number parser module

File to create: src/server/ticket-number.ts

Three exports:

parseTicketNumber(raw: string): { prefix: string; num: number; paddingWidth: number } | null
- Regex: ^([A-Z]+)-(\d+)$
- Returns parsed parts or null

formatTicketNumber(prefix: string, num: number, paddingWidth: number): string
- Returns PREFIX-ZEROPADDEDNUMBER

suggestNextTicketNumber(tickets: Array<{ number: string; createdAt?: string }>): string | null
- Filter to parseable tickets
- If none, return null
- Find most recently created (by createdAt; missing createdAt = oldest)
- Use that ticket's prefix
- Find highest num among all tickets with that prefix
- Use paddingWidth from the highest-numbered ticket
- Return formatTicketNumber(prefix, highestNum + 1, paddingWidth)

## Step 2: Create tests for ticket number parser

File to create: src/server/ticket-number.test.ts

Test groups:
- parseTicketNumber: valid patterns, invalid patterns, padding width extraction
- formatTicketNumber: basic formatting, overflow past padding
- suggestNextTicketNumber: empty array, unparseable, single prefix, multiple prefixes, gaps, missing createdAt, padding inheritance

## Step 3: Add createdAt to StatusJson and createTicket

File to modify: src/server/ticket-store.ts

- Add optional createdAt?: string to StatusJson interface
- In createTicket, add createdAt: new Date().toISOString() to the status object
- readStatusJson already handles missing fields via spread; no change needed
- updateTicket already preserves extra fields via spread; no change needed

## Step 4: Add archive scanning to TicketStore

File to modify: src/server/ticket-store.ts

Add method:
listAllTicketNumbers(): Array<{ number: string; createdAt?: string }>
- Read active tickets (scan worktreeDir subdirs for status.json)
- Read archived tickets from path.join(worktreeDir, 'archive') if it exists
- For each subdir, read status.json, extract number and createdAt
- Return combined list

## Step 5: Add tests for createdAt and archive scanning

File to modify: src/server/ticket-store.test.ts

Test cases:
- createTicket writes createdAt
- updateTicket preserves createdAt
- listAllTicketNumbers returns active tickets
- listAllTicketNumbers includes archived tickets
- listAllTicketNumbers with empty archive
- listAllTicketNumbers with no tickets

## Step 6: Add suggestNextNumber to TicketStore

File to modify: src/server/ticket-store.ts

Add method:
suggestNextNumber(): string | null
- Calls listAllTicketNumbers() then suggestNextTicketNumber()
- Import suggestNextTicketNumber from ./ticket-number.js

## Step 7: Add integration tests for suggestNextNumber

File to modify: src/server/ticket-store.test.ts

Test cases:
- No tickets returns null
- One ticket returns next number
- After archiving, still considers archived ticket
- Mixed active/archived uses highest across both

## Step 8: Expose suggestNextNumber in loadBoard

File to modify: src/server/actions.ts

- Add suggestedNextNumber: string | null to BoardPageData
- Call store.suggestNextNumber() in loadBoard success path
- Add suggestedNextNumber: null to error paths

## Step 9: Update CreateTicketDialog

File to modify: src/components/CreateTicketDialog.tsx

- Add suggestedNextNumber prop
- Use createEffect to pre-fill number when dialog opens and suggestion exists
- Clear on close (already happens)

## Step 10: Wire suggestedNextNumber in project page

File to modify: src/routes/project/[slug].tsx

- Pass d().suggestedNextNumber to CreateTicketDialog

## Step 11: Verify

- npm test passes
- TypeScript compiles
- Dev server works end-to-end

## File Summary

Create:
1. src/server/ticket-number.ts
2. src/server/ticket-number.test.ts

Modify:
3. src/server/ticket-store.ts
4. src/server/ticket-store.test.ts
5. src/server/actions.ts
6. src/components/CreateTicketDialog.tsx
7. src/routes/project/[slug].tsx

## Dependency Graph

Step 1 -> Step 2 -> Step 3 -> Step 4 -> Step 5 -> Step 6 -> Step 7 -> Step 8 -> Step 9 -> Step 10 -> Step 11
