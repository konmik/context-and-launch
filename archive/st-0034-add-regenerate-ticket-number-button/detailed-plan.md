# Plan: Add Regenerate Ticket Number Button

## Goal

Add a regenerate button next to the ticket number input in the create-ticket dialog. Clicking it extracts the prefix from whatever the user has typed, asks the server for the next free number for that prefix (scanning both active and archived tickets), and replaces the field value. If the field is empty, it falls back to the default suggestion (most recently created ticket's prefix). The button is disabled while the request is in flight.

## Steps

### Step 1: Add `extractPrefixFromInput` to the pure ticket-number module

File to modify: `src/core/ticket/ticket-number.ts`

Add a new exported function:

```
extractPrefixFromInput(raw: string): string | null
```

Takes raw user input and leniently extracts a prefix: take leading ASCII letters (`/^[A-Za-z]+/`), uppercase them. Return `null` if no leading letters are found (empty string, starts with digit/dash, etc).

Examples: `"BUG"` -> `"BUG"`, `"BUG-"` -> `"BUG"`, `"BUG-7"` -> `"BUG"`, `"bug"` -> `"BUG"`, `""` -> `null`, `"123"` -> `null`.

Acceptance criteria: Function exported and handles all cases from the PRD.

### Step 2: Add optional `prefix` parameter to `suggestNextTicketNumber`

File to modify: `src/core/ticket/ticket-number.ts`

Change the signature of `suggestNextTicketNumber` to:

```
suggestNextTicketNumber(
  tickets: Array<{ number: string; createdAt?: string }>,
  prefix?: string,
): string | null
```

When `prefix` is provided:
- Filter parsed tickets to those matching the given prefix.
- If none match, return `formatTicketNumber(prefix, 1, 4)` (start at 1 with padding width 4).
- If some match, find the highest num among them, return `formatTicketNumber(prefix, highest.num + 1, highest.paddingWidth)`.

When `prefix` is omitted (undefined): keep the existing behavior unchanged (most recently created ticket's prefix, highest+1).

Acceptance criteria: Existing tests still pass. New prefix parameter works for known prefix, unknown prefix, and omitted prefix.

### Step 3: Add optional `prefix` parameter to `TicketStore.suggestNextNumber`

File to modify: `src/core/ticket/ticket-store.ts`

Change method signature on line 309 from:

```
suggestNextNumber(): string | null
```

to:

```
suggestNextNumber(prefix?: string): string | null
```

Pass through to: `suggestNextTicketNumber(this.listAllTicketNumbers(), prefix)`.

Acceptance criteria: Existing callers (which pass no argument) are unaffected. With a prefix, returns the correct number for that prefix including archived tickets.

### Step 4: Add `regenerateTicketNumber` server function

File to modify: `src/components/ticket/ticket-api.ts`

Add a new exported server function:

```
export async function regenerateTicketNumber(
  projectSlug: string,
  rawFieldValue: string,
): Promise<string | null> {
  "use server";
  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
  const store = new TicketStore(worktreeDir);
  const prefix = extractPrefixFromInput(rawFieldValue);
  return store.suggestNextNumber(prefix ?? undefined);
}
```

Import `extractPrefixFromInput` from `~/core/ticket/ticket-number.js`.

When prefix is null (empty field / no leading letters), `suggestNextNumber(undefined)` falls back to default behavior (most recently created ticket's prefix).

This is a fire-and-forget server function (no `query()` or `action()` wrapper) because it is an on-demand button-triggered read, not a page-load read. It follows the existing pattern used in the codebase for direct server calls.

Acceptance criteria: Function is callable from the client and returns the correct suggested number.

### Step 5: Add `regenerate` command to create-ticket controller

File to modify: `src/components/ticket/create-ticket-controller.ts`

Changes:

1. Add a new dependency field to `CreateTicketDeps`:
   ```
   onRegenerate: (rawFieldValue: string) => Promise<string | null>;
   ```

2. Inside `createCreateTicketController`, add:
   - A `[regenerating, setRegenerating] = createSignal(false)` signal.
   - A `regenerate` async function that:
     - Sets `regenerating(true)`.
     - Calls `deps.onRegenerate(number())` with the current field value.
     - If the result is non-null, calls `setNumber(result)`.
     - Sets `regenerating(false)` in a finally block.

3. Add `regenerating` and `regenerate` to the returned object.

Acceptance criteria: `regenerating` signal reflects in-flight state. `regenerate` calls the dependency with the current number field value and updates the field on success.

### Step 6: Add regenerate button to CreateTicketDialog

File to modify: `src/components/ticket/CreateTicketDialog.tsx`

Changes:

1. Add `projectSlug: string` to `CreateTicketDialogProps`.

2. Add `onRegenerate` to the deps passed to `createCreateTicketController`:
   ```
   onRegenerate: (rawFieldValue: string) => regenerateTicketNumber(projectSlug, rawFieldValue),
   ```
   Import `regenerateTicketNumber` from `./ticket-api.js`.

3. Wrap the number input and button in a flex container. Replace the current `<input>` with:
   ```
   <div class="flex gap-2">
     <input ... class="input flex-1" ... />
     <button
       type="button"
       class="btn-icon shrink-0"
       title="Regenerate number"
       disabled={s.regenerating()}
       onClick={s.regenerate}
       data-testid="create-ticket-regenerate-button"
     >
       <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
         viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">
         <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
         <path d="M3 3v5h5"/>
         <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
         <path d="M16 16h5v5"/>
       </svg>
     </button>
   </div>
   ```
   This reuses the same refresh-ccw Lucide icon already used for the Sync button.

Acceptance criteria: Button appears next to the number input. Clicking it replaces the field value with the server-suggested number. Button is disabled while the request is in flight.

### Step 7: Pass `projectSlug` to CreateTicketDialog from the route

File to modify: `src/routes/project/[projectSlug].tsx`

On line 231-236 where `<CreateTicketDialog>` is rendered, add the `projectSlug` prop:

```
<CreateTicketDialog
  open={dialogState().createTicketOpen}
  onOpenChange={commands.setCreateTicketOpen}
  onSubmit={commands.handleCreateTicket}
  suggestedNextNumber={ld()?.suggestedNextNumber ?? null}
  projectSlug={d().projectSlug}
/>
```

`d().projectSlug` is already available on the loaded data object in this route.

Acceptance criteria: The dialog receives the project slug needed to call the server function.

### Step 8: Unit tests for new pure functions

File to modify: `src/core/ticket/ticket-number.test.ts`

Add a new `describe('extractPrefixFromInput')` block with tests:
- `"BUG"` -> `"BUG"`
- `"BUG-"` -> `"BUG"`
- `"BUG-7"` -> `"BUG"`
- `"bug"` -> `"BUG"` (lowercase input uppercased)
- `"bug-0012"` -> `"BUG"`
- `""` -> `null`
- `"123"` -> `null`
- `"-BUG"` -> `null` (starts with dash)
- `" BUG"` -> `null` (starts with space)

Add tests to the existing `describe('suggestNextTicketNumber')` block for the new `prefix` parameter:
- With explicit prefix matching existing tickets: returns highest+1 for that prefix.
- With explicit prefix not matching any ticket: returns `PREFIX-0001`.
- With explicit prefix where other-prefix tickets exist but not the requested one: returns `PREFIX-0001`.
- With explicit prefix and mixed active/archived tickets with that prefix: returns highest+1 across both.

Acceptance criteria: All new tests pass. All existing tests still pass.

### Step 9: Unit tests for TicketStore.suggestNextNumber with prefix

File to modify: `src/core/ticket/ticket-store.test.ts`

Add tests in the existing suggestion section (after the current `suggestNextNumber` tests around line 1329):
- `suggestNextNumber with prefix returns next number for that prefix`
- `suggestNextNumber with unknown prefix returns PREFIX-0001`
- `suggestNextNumber with prefix considers archived tickets`

Acceptance criteria: Tests pass and verify the store correctly passes the prefix through to the pure module over the full ticket list.

### Step 10: E2E test for regenerate button

File to modify: `e2e/create-ticket-dialog.test.ts`

Add a `SeedTicket` interface field: update `e2e/fixtures.ts` to include an optional `createdAt` in `SeedTicket` and write it into `status.json` when present.

Add a new test to the existing describe block:

```
it("regenerate button suggests number for typed prefix", async () => {
  const project = await createProject(ctx.testServer, {
    projectSlug: uniqueSlug("ct-regen"),
    withTickets: [
      { number: "ST-0001", title: "First", status: "todo" },
      { number: "ST-0002", title: "Second", status: "todo" },
      { number: "BUG-0001", title: "Bug One", status: "todo" },
    ],
  });
  ctx.projects.push(project);
  await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
  await openCreate();
  await ctx.page.fill('[data-testid="create-ticket-number-input"]', "BUG");
  await ctx.page.click('[data-testid="create-ticket-regenerate-button"]');
  // Wait for the field to be updated
  await ctx.page.waitForFunction(
    () => (document.querySelector('[data-testid="create-ticket-number-input"]') as HTMLInputElement)?.value.startsWith("BUG-"),
    { timeout: 10000 },
  );
  const value = await ctx.page.inputValue('[data-testid="create-ticket-number-input"]');
  expect(value).toBe("BUG-0002");
}, 60000);
```

Acceptance criteria: Test seeds a project with ST and BUG tickets, opens create dialog, types "BUG", clicks regenerate, and asserts the field contains "BUG-0002".

## Dependencies Between Steps

- Steps 1-2 must complete before Step 3 (store uses pure module).
- Steps 1-3 must complete before Step 4 (server function uses store and pure module).
- Step 4 must complete before Step 6 (dialog imports server function).
- Step 5 must complete before Step 6 (dialog uses controller's regenerate command).
- Step 7 depends on Step 6 (dialog must accept projectSlug prop before route can pass it).
- Steps 8-9 can start after Steps 1-3 respectively.
- Step 10 can start after Steps 6-7.

Parallelizable: Steps 1-2 together (same file). Steps 5, 7 are independent of each other once their prerequisites are met.

## Edge Cases

- Empty field: `extractPrefixFromInput("")` returns null, server falls back to default suggestion (most recently created ticket's prefix + highest+1). If no tickets exist at all, returns null and the field is not updated.
- Field with only digits/symbols: `extractPrefixFromInput("123")` returns null, same fallback as empty field.
- Prefix with no existing tickets: `suggestNextTicketNumber(tickets, "NEWPREFIX")` returns `"NEWPREFIX-0001"` (padding width 4).
- Rapid double-click: The button is disabled while `regenerating()` is true, so a second click is ignored until the first request completes.
- Server error: The `regenerateTicketNumber` server function does not use try/catch because it is a read-only operation in a local Electron app. If it throws, the promise rejection propagates to the controller's `regenerate` method. The controller's finally block ensures `regenerating` is set back to false. The field value is not changed on error.

## Validation

1. Run `npm run test:all` to verify all unit tests pass (including new ones in Steps 8-9) and e2e tests pass (including Step 10).
2. Manual verification: open the app, create a project with a few ST-prefixed tickets, open create-ticket dialog, type "BUG", click regenerate, confirm field shows "BUG-0001". Type "ST", click regenerate, confirm field shows the next ST number. Clear the field, click regenerate, confirm it uses the default suggestion.
3. Verify the button is visually aligned with the number input and uses the refresh icon.
4. Verify the button disables during the request (observable by adding a slight delay or checking the disabled attribute in DevTools).
