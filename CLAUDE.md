Do not add Co-Authored-By lines to commit messages.
Never push to remote.
Be brief.
Never use the memory system.
Do not use underscore or bold markdown formatting in md files.
Never use claude -p or claude --print flags. These modes are billed.
Never swallow errors with empty catch blocks. Always surface errors to the user.
Do not change the text of buttons when running, use a disabled state instead.
Run dev server: `npm run dev`.
Run all tests: `npx vitest run`.
Write UI tests with playwright.
When writing e2e, mock file system and process calls only, use playwright for UI.
We are using only TypeScript, do not check for types randomly, do not write incorrect-type tests.
Avoid non-ASCII unless explicitly asked.
Do not use z-index (Tailwind z-* classes). Use Portal from solid-js/web for stacking.
