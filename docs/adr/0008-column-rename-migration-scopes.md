# Column rename asks the user which projects to migrate

When a column is renamed in a Board Definition, ticket statuses and column defaults across projects may need updating. Rather than silently migrating everything or doing nothing, the rename dialog presents three choices: "All projects" (update every project using this board), "Current project" (update only the active project), or "None" (rename in the board definition only, orphaning tickets with the old status).

## Considered Options

- Always migrate all projects silently. Rejected: the user may have intentionally divergent ticket states across projects, and a global silent migration could disrupt that. It also makes rename a surprisingly heavy operation with no visibility.
- Never migrate, let tickets become orphaned. Rejected: forcing users to manually drag every orphaned ticket after a simple rename is too punishing. Most renames are cosmetic and the user expects tickets to follow.
- Prompt with scope choices. Chosen: gives the user control without forcing a single policy. The "None" option preserves the escape hatch for advanced use cases. Stage Markdown files are intentionally not renamed -- they are content artifacts and renaming them could break external references.
