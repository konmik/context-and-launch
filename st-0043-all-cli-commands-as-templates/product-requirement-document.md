# Global Command Templates

## Problem Statement

Context & Launch constructs many production CLI commands in application code and bundled platform launch scripts. Users cannot review or adapt those commands to match locally installed tools, aliases, shell conventions, or workflow preferences. Some user-facing commands already live in Launcher Config, but Git, Herdr, worktree, picker, operating-system integration, process-inspection, and launch-bootstrap commands remain hidden and hardcoded. Changing one currently requires modifying the application itself.

## Solution

Add a global, fixed Command Template catalog containing every production external-process action that is currently hardcoded. Users can inspect and edit each action as a full, multiline platform-shell script in Settings. Bundled JSON provides the complete default catalog, while a global user JSON file stores only overrides. Each catalog entry has its own reset-to-default control.

Command Templates use flat semantic keys, support escaped runtime placeholders, and run through a fixed shell for the active platform. A template may combine commands that form one uninterrupted application action, while commands separated by application decisions remain separate entries. Every execution is logged with the catalog key so customized behavior remains diagnosable.

## Requirements

1. Every production external-process action currently hardcoded in the application or its bundled launch helpers resolves through the fixed Command Template catalog — because users asked to review and customize all CLI behavior rather than only selected integrations.
2. Settings displays every Command Template applicable to the current platform with its key, effective script, and whether it uses a bundled default or user override — because users need to understand both the command's identity and the source of its current behavior.
3. A user can edit a Command Template as unrestricted multiline text with full shell syntax — because real workflows may require environment assignments, conditionals, pipes, redirects, or several commands executed in sequence.
4. Command Template customizations apply globally and cannot be overridden per Project — because the commands describe integrations with tools installed on the user's machine rather than Project-specific behavior.
5. The Command Template catalog has a fixed set of keys that users cannot add, remove, or rename in Settings — because application logic depends on known actions and known output contracts.
6. Platform-specific commands use independent flat keys such as `open.directory.windows`, `open.directory.macos`, and `open.directory.linux` — because users want a simple JSON map rather than nested platform objects.
7. Windows Command Templates execute with PowerShell, while macOS and Linux Command Templates execute with Bash — because each editable script needs predictable syntax and failure semantics on its platform.
8. A single Command Template may contain multiple sequential commands when the application does not inspect an intermediate result or choose the next action — because one editable script should represent one coherent application action rather than every source-level process call.
9. Commands separated by application-side parsing, branching, retries, or state transitions remain separate Command Templates — because combining them would prevent the application from preserving its existing decisions and output handling.
10. Multiline execution stops after the first command failure and returns the failure and captured output to the calling feature — because later commands must not run after an earlier prerequisite has failed.
11. Known scalar placeholder values are escaped as one literal argument for the active platform shell, and known list placeholders expand as separately escaped arguments — because runtime paths, names, and messages may contain spaces or shell metacharacters without intending to become shell code.
12. Settings saves template text without checking for blank content, removed placeholders, unknown placeholders, or shell syntax errors — because users explicitly chose unrestricted editing and ordinary execution-time behavior over editor validation.
13. Unresolved placeholder text is passed to the shell unchanged and receives no special pre-execution error — because the shell or invoked command is the authority on whether the customized script is executable.
14. Bundled defaults contain the complete fixed catalog, while the global user configuration stores only keys whose values differ from their defaults — because sparse overrides preserve customizations while allowing later application versions to add new commands automatically.
15. Each Command Template has a reset-to-default control that removes only that key's user override and immediately restores the bundled script — because users need a safe, local way to undo an individual customization.
16. Reset is disabled or otherwise visibly unnecessary when a Command Template already uses its bundled default — because the interface should accurately communicate whether reset would change anything.
17. Editing or resetting one Command Template leaves every other override unchanged — because command customizations are independent settings.
18. Existing execution contracts, including working directory, environment, timeout, output parsing, cancellation interpretation, detached or interactive behavior, and feature-level error presentation, remain intact unless a customized script naturally changes its output — because this feature customizes commands rather than redesigning the workflows that consume them.
19. Every start, success, and failure log entry for a Command Template execution includes the exact Command Template key — because users need to connect runtime behavior and failures to the editable Settings entry.
20. A malformed global overrides file or an override key outside the fixed catalog produces a visible configuration error rather than silently changing or discarding behavior — because the application must not hide configuration corruption or pretend an unsupported command is active.
21. New bundled keys appear in Settings after an application upgrade without rewriting or deleting existing overrides — because the complete catalog will evolve while user customizations must remain stable.
22. Production code does not bypass the catalog with literal executable invocations, except for the fixed platform-shell runner itself and commands already supplied as user data through Coding Agent Profiles or Shortcuts — because a single explicit boundary makes catalog completeness reviewable and testable.

## Implementation Decisions

- Introduce one global Command Template service as the sole boundary for loading defaults, merging user overrides, interpolating known placeholders, selecting the fixed platform shell, executing scripts, and attaching keys to logs.
- Represent both bundled defaults and user overrides as JSON objects whose values are strings. The bundled object's keys define the catalog; the user object is a sparse overlay and cannot define new actions.
- Keep catalog metadata that is not user-editable, such as the display label, feature grouping, platform applicability, working-directory source, execution mode, timeout, and output contract, in application-owned definitions keyed by the same fixed identifiers.
- Name keys by semantic feature action rather than executable or source-code call. Use dot-separated names and append `.windows`, `.macos`, or `.linux` when an action has platform-specific implementations.
- Group the Settings entries by feature area: Git and repository checks, Ticket Sync, Worktree management, Agent Worktree lifecycle, Herdr integration, agent launching and process inspection, file and directory pickers, and operating-system open actions.
- Treat the fixed shell launcher as execution infrastructure. Use PowerShell on Windows and Bash on macOS and Linux; templates do not select or replace their interpreter.
- Apply platform-shell escaping only to placeholders known to the action's fixed runtime contract. Leave unknown `{{name}}` text untouched and perform no completeness or syntax validation before saving or execution.
- For known list placeholders, interpolate a sequence of individually escaped arguments rather than one joined string.
- Run a multiline script as one action under strict first-failure behavior. Preserve the caller's existing capture, timeout, cancellation, detached, and interactive modes through fixed execution metadata rather than embedding those controls in editable text.
- Keep an application decision boundary between templates whenever output is parsed before continuing, a non-zero exit is treated as a probe result, a retry or fallback is selected, or application state is updated between commands.
- Cover all currently hardcoded production command families, including Git version and state probes, auto-commit operations, Ticket Sync and Conflict Resolution operations, ticket Worktree creation and adoption, Agent Worktree creation and cleanup, remote and integration checks, Herdr workspace and agent operations, stale-agent process inspection, native file and directory pickers, directory opening, terminal startup, and bundled agent-launch bootstrap operations.
- Coding Agent Profile and Shortcut command bodies remain in Launcher Config because they are already user-supplied data and may still be added or removed under their existing product rules. Their shared execution path uses the fixed platform-shell contract, and logs identify both the stable runner key and the selected profile or Shortcut name.
- The Settings surface uses a dedicated Command Templates tab. Each row shows the immutable key and override state, opens a multiline editor, provides Save and Cancel actions, and exposes a per-row Reset to default action without add, delete, or rename controls.
- Settings shows entries for the current platform and shared entries. Overrides for other platforms remain preserved in the global JSON when the file is used across machines.
- Saving a value equal to the bundled default removes the sparse override rather than persisting redundant data.
- Resetting updates the effective value in the open Settings view after persistence succeeds. Persistence failures retain the edited value in the editor and surface through the existing error UI.
- Log messages carry the Command Template key as structured context for start, success, failure, timeout, and spawn errors. Existing redaction and output-detail behavior remains unchanged.
- The default catalog is versioned with the application, while the sparse overrides live in the global application configuration area and are never copied into project-level Launcher Config.
- Existing environment-variable test stubs remain higher-priority test boundaries and do not become user-visible Command Template behavior.

## Testing Decisions

- Use the global Command Template service as the primary test seam; tests should assert effective scripts, persisted overrides, reset behavior, interpolation results, execution requests, outputs, and logged keys without coupling to internal helper functions.
- Unit-test bundled-default and sparse-override merging, including a missing overrides file, one and several overrides, saving a default-equivalent value, a newly added bundled key, malformed JSON, and an unknown override key.
- Unit-test platform selection and interpolation with paths, messages, and list values containing spaces, quotes, newlines, dollar signs, ampersands, semicolons, backticks, braces, and other shell metacharacters.
- Unit-test that blank scripts, removed known placeholders, unknown placeholders, and syntactically invalid text are accepted by persistence and forwarded unchanged except for interpolation of known placeholders.
- Unit-test multiline execution through an injected process boundary, including first-command failure, combined output, timeout, detached execution, interactive execution, and key-bearing start, success, and failure logs.
- Add focused platform shell tests for real PowerShell and Bash behavior, especially first-failure handling and escaped scalar and list placeholders. Follow the repository convention by naming terminal-launching coverage as shell tests and running it only through the explicit shell-test command.
- Add real-server end-to-end coverage to the existing Settings suite for listing fixed entries, editing multiline text, persisting a global sparse override, showing override state, resetting one entry, preserving other entries, and offering no add, delete, or rename controls.
- Extend existing feature-level tests for Ticket Sync, Worktree management, Agent Worktree cleanup, Herdr control, agent launch, pickers, and operating-system opening to assert that the expected semantic key and runtime values cross the Command Template seam while retaining current observable results.
- Add a catalog-completeness test or equivalent architectural guard proving that each application-owned command action has a bundled default and that production external-process call sites use the Command Template executor rather than constructing executables directly.
- Prefer assertions on visible Settings behavior, persisted JSON, process requests, returned output, feature outcomes, and logs. Do not assert component layout details, private helper call order, or the exact internal module decomposition.
- Use the existing sandboxed data-directory and real-server fixtures for persistence tests so user configuration and real Projects are never modified.

## Out of Scope

- Project-specific Command Template overrides.
- Adding, deleting, renaming, duplicating, importing, exporting, or reordering fixed Command Template entries.
- Placeholder validation, required-placeholder enforcement, shell syntax linting, command previews, autocomplete, or a visual shell-command builder.
- Letting a template choose its interpreter or configuring the PowerShell and Bash executables through the same catalog.
- Changing the business logic, state machines, output schemas, cancellation rules, or safety confirmations of Ticket Sync, Conflict Resolution, Worktree cleanup, Herdr, picker, and launch features.
- Migrating user-defined Coding Agent Profiles or Shortcuts into fixed catalog entries or removing their existing add and delete behavior.
- Development, build, test, packaging, and contributor-only commands that are not invoked by the shipped application at runtime.
- Executing Command Templates from remote configuration or treating them as untrusted input.

## Further Notes

- Command Template is a new term distinct from the existing Template domain concept. A Template assembles agent prompt text; a Command Template defines a platform-shell action used by the application.
- Full shell syntax makes Command Templates trusted local code with the same filesystem and process authority as Context & Launch. The UI should state this plainly near the editor.
- The catalog's definition of “all” is every external process invoked by shipped runtime behavior, including platform plumbing. Direct filesystem and operating-system API calls that do not launch a process are not Command Templates.
- The fixed platform shell is the only intentional hardcoded executable boundary. Without that bootstrap exception, the command system would require a command template to execute itself.
- A semantic action may contain several command lines, but source-code proximity alone is not a reason to combine actions. The deciding factor is whether the application must regain control between commands.
