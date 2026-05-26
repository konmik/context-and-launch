Do not add Co-Authored-By lines to commit messages.
Never push to remote.
Be brief.
Never use the memory system.
Do not use underscore or bold markdown formatting in md files.
Never use claude -p or claude --print flags. These modes are billed.
Never swallow errors with empty catch blocks. Always surface errors to the user.
Do not change the text of buttons when running, use a disabled state instead.
Run dev server: `npm run dev`.
Run all tests: `npm run test:all` (tsc + unit + build + e2e). Never skip e2e.
There cannot be any pre-existing errors. All tests pass before and after merging. If there is an error, fix it immediately, do not leave it for later.
Write UI tests with playwright.
When writing e2e, mock file system and process calls only, use playwright for UI.
We are using only TypeScript, do not check for types randomly, do not write incorrect-type tests.
Avoid non-ASCII unless explicitly asked.
Do not use z-index (Tailwind z-* classes). Use Portal from solid-js/web for stacking.
Do not duplicate code. Extract shared logic into reusable helpers.
