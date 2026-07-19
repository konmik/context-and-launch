# Herdr Launching

## Problem Statement

The Agent Launcher currently starts every coding agent in a separate external terminal. This scatters agents across windows, makes Project-level agent state difficult to scan, and prevents the user from managing a Project's agents together in Herdr.

The existing Coding Agent Profile command can invoke arbitrary scripts, but making Herdr work through a user-authored PowerShell wrapper would duplicate launch orchestration outside the application. It would also leave Context & Launch unable to enforce one agent per Ticket Folder, interpret Herdr state, restart an idle agent safely, or deliver existing `<<ENTER>>` prompt sequences through Herdr's native input interface.

## Solution

Add Herdr as a configurable Launch Target for Coding Agent Profiles. A Herdr-target profile keeps its command line fully user-editable while Context & Launch owns the behavior that must remain consistent: finding or creating the Project's Herdr Workspace, preventing concurrent Herdr Agents for a Ticket, replacing an idle matching agent, executing the configured launch command, reading the launched pane identity, and delivering the assembled prompt.

Each Project gets one lazily created Herdr Workspace. Each Ticket Folder identifies at most one Herdr Agent inside that workspace. Launching while the matching agent is working, blocked, done, or unknown is rejected. Launching while it is idle closes it and starts a fresh agent with the new prompt. No custom PowerShell launcher is required.

## Requirements

1. Every Coding Agent Profile has a Launch Target of either Direct Terminal or Herdr — because launch behavior must be explicit without creating a separate profile system.
2. A profile with no stored Launch Target behaves as Direct Terminal — because existing user and Project configurations must remain backward compatible.
3. The Settings profile editor allows the user to select the Launch Target and edit the complete command line — because focus, placement, agent executable, and other CLI flags are user workflow choices.
4. The application does not hardcode `codex1` or any other personal agent command — because agent commands belong to user configuration rather than repository defaults.
5. Direct Terminal profiles retain their current launch, Agent Marker, prompt-delivery, and error behavior — because adding Herdr must not regress existing workflows.
6. Herdr behavior applies to launches from the Ticket Detail Dialog's Agent Launcher — because this feature is scoped to Ticket-based work in the current branch.
7. Before a Herdr launch, the application completes the existing Project, Ticket, dirty-main-branch, behind-remote, and Agent Worktree checks — because Herdr must receive the same validated launch directory as Direct Terminal launches.
8. The application discovers the Project's current Herdr Workspace on every Herdr launch — because Herdr workspace IDs are runtime identities and may change when a session is recreated.
9. The application associates a Herdr Workspace with its Project using the Project Slug and displays the Project Slug as the workspace label — because the association must be deterministic and understandable to the user.
10. If no associated Herdr Workspace exists, the application creates one with the Project path as its initial working directory — because the workspace represents the Project rather than one Ticket's Agent Worktree.
11. If exactly one unassociated Herdr Workspace has the Project Slug as its label, the application adopts it instead of creating a duplicate — because users may already have created the intended Project workspace manually.
12. If more than one Herdr Workspace claims or ambiguously matches the Project, launch fails with an actionable error — because silently selecting the wrong workspace could run an agent in the wrong Project context.
13. A Herdr Agent's stable configured identity includes both the Project Slug and Ticket Folder name — because Ticket Folder names can collide across Projects while Herdr agent names are session-wide targets.
14. Before executing a Herdr profile command, the application searches the associated Herdr Workspace for a matching Herdr Agent — because the same Ticket, folder, and Agent Worktree must not receive concurrent agents.
15. If no matching Herdr Agent exists, the application starts a new one — because the Ticket has no active Herdr session to protect or replace.
16. If the matching Herdr Agent is idle, the application closes its pane and starts a fresh agent — because the user wants a new session with the new prompt rather than resuming the idle conversation.
17. The replacement launch begins only after Herdr confirms that the idle pane was closed — because overlapping shutdown and startup could briefly create duplicate agents or ambiguous identities.
18. If the matching Herdr Agent is working, blocked, done, or unknown, launch is rejected without closing, focusing, or sending input to it — because every non-idle state must be treated as potentially active or unsafe to replace.
19. A rejected duplicate launch identifies the Ticket and reports the observed Herdr state — because the user must understand why the launch was refused and where to resolve it.
20. Herdr profile commands can interpolate the Project Slug, Ticket Folder name, resolved launch directory, resolved Herdr workspace ID, and derived Herdr agent name — because the user-configured CLI line needs all runtime identities required to place the agent correctly.
21. Existing profile placeholders remain available to Herdr profiles where meaningful — because changing Launch Target should not unnecessarily reduce command customization.
22. The application executes a Herdr profile command with the resolved Agent Worktree or Project path as its working directory — because agent commands and relative paths must use the same launch directory shown in the Ticket Detail Dialog.
23. A successful Herdr profile command must return Herdr's standard JSON launch result containing the created agent's pane identity — because the application needs an authoritative target for prompt delivery.
24. A non-zero Herdr command exit, malformed JSON response, unexpected response type, or missing pane identity fails the launch visibly — because prompt text must never be sent to an inferred or unrelated pane.
25. The application interprets `<<ENTER>>` markers for Herdr profiles exactly as it does for Direct Terminal profiles — because existing Templates and Skills must work without Herdr-specific copies.
26. Text between `<<ENTER>>` markers is sent literally to the launched Herdr pane and each marker sends an Enter key — because prompt content and deliberate submission boundaries must be preserved.
27. Prompt chunks retain the existing delay between submissions — because interactive agent startup and trust prompts need time to become ready before subsequent input arrives.
28. Prompt delivery does not require the Herdr pane or workspace to be focused — because focus behavior belongs to the user-configured Herdr command line.
29. If prompt delivery fails after the agent starts, the application reports the failure and leaves the Herdr Agent intact — because silently killing a successfully started interactive process could discard useful state.
30. Missing Herdr installation, an unavailable Herdr server, an incompatible CLI response, or a failed Herdr operation produces an actionable launch error with no Direct Terminal fallback — because silent fallback would violate the selected Launch Target and scatter agents into unexpected windows.
31. Herdr launch behavior uses the native Herdr CLI/API contract and requires no generated or user-authored PowerShell wrapper — because the integration must remain inspectable, cross-platform, and owned by the application.
32. Existing app-scope and Project-scope profile merging, collision rules, column defaults, and last-used profile behavior apply unchanged to Herdr profiles — because Launch Target is an attribute of a Coding Agent Profile rather than a new configuration scope.

## Implementation Decisions

- Extend the Coding Agent Profile data model with a Launch Target discriminator. Treat an absent discriminator as Direct Terminal during parsing and merging so old configuration files need no migration.
- Add the Launch Target selector to the existing profile add/edit form. Keep the command field user-editable for both targets and show Herdr-specific placeholders when Herdr is selected.
- Keep Direct Terminal launch behind the existing profile-spawn path. Route Herdr profiles through a dedicated Herdr gateway instead of adding Herdr conditionals to the detached-process utility.
- The Herdr gateway owns CLI execution, JSON decoding, response validation, and conversion of Herdr failures into application errors. Callers consume typed workspace, agent, and pane results rather than raw JSON.
- Resolve a Herdr Workspace by Project association metadata first and exact Project Slug label second. Adopt one unambiguous label match, attach the association metadata, and create a new workspace only when neither exists.
- Do not persist Herdr workspace IDs in Launcher Config or ticket metadata. Resolve them from live Herdr state for each launch.
- Use a deterministic Herdr agent name derived from the Project Slug and Ticket Folder name. Keep the Ticket Folder name as the ticket-side identity even though the existing placeholder is named `ticketSlug`.
- Model the Herdr preflight as a closed state decision: absent starts, idle closes then starts, and working/blocked/done/unknown reject. Unexpected or duplicate matches are errors rather than fallbacks.
- Execute the full user-configured Herdr profile command after interpolating the live Herdr workspace ID, deterministic agent name, launch directory, and existing profile variables. The command is responsible for user-controlled flags such as focus and placement.
- Capture the configured command's output instead of spawning it through the detached Direct Terminal path. Accept only a successful Herdr agent-launch response and use its returned pane ID for all prompt input.
- Reuse the existing prompt tokenization semantics. Implement the transport with Herdr pane text and key operations rather than Windows keystroke injection.
- Keep Agent Marker detection for Direct Terminal profiles. Herdr-target duplicate detection uses live Herdr workspace and agent state because the application does not own the Herdr agent process lifetime.
- Keep Sync conflict resolution, Shortcuts, Herdr installation, Herdr integration installation, remote Herdr sessions, and Herdr workspace management UI outside this launch path.

## Testing Decisions

- Test observable launch behavior through the existing real-server e2e seam: configure a Herdr profile, open a Ticket's Agent Launcher, and launch through the same action used by the UI.
- Put a fake `herdr` executable on the isolated e2e server's path. It must emit protocol-compatible JSON, maintain fake workspace/agent state, and record invocations so tests exercise process and serialization boundaries without requiring a developer's live Herdr session.
- Verify first launch creates one Project-labeled Herdr Workspace, launches in the resolved Agent Worktree, interpolates the runtime placeholders, and sends prompt text and Enter keys to the returned pane.
- Verify a later Ticket in the same Project reuses the Herdr Workspace while receiving its own deterministic Herdr Agent identity and launch directory.
- Verify an idle matching Herdr Agent is closed before a fresh launch and receives only the new assembled prompt.
- Verify working, blocked, done, and unknown matching agents each reject launch without closing the pane, executing the profile command, or sending prompt input.
- Verify ambiguous workspace matches, duplicate agent matches, missing Herdr, server failure, non-zero command exit, malformed JSON, wrong response type, missing pane identity, and prompt-delivery failure all surface through the existing launch-error UI.
- Verify profiles without a Launch Target continue through Direct Terminal behavior and that existing Launcher Config fixtures load unchanged.
- Verify app-scope and Project-scope Herdr profiles can be added, edited, overridden, selected as column defaults, and reloaded through the Settings UI.
- Unit-test pure config parsing, merge behavior, placeholder interpolation, Herdr response decoding, deterministic agent naming, and status decisions where the behavior can be tested without UI or process orchestration.
- Follow existing Agent Launcher tests for request/result behavior, Launcher Config tests for persistence and merging, and the real-server e2e harness for filesystem, process, and UI integration.
- Tests assert externally visible state and issued Herdr operations rather than internal helper calls or source-text patterns.

## Out of Scope

- Replacing or removing Direct Terminal launch support.
- Hardcoding or installing `codex1`, Codex, Claude, Pi, or any other coding-agent command.
- Creating a user-specific Coding Agent Profile in repository defaults or migrating an existing installed profile automatically.
- Managing Herdr installation, updates, configuration files, themes, keybindings, integrations, sessions, or server lifecycle.
- Adding a Herdr workspace, tab, pane, or agent browser to the Context & Launch UI.
- Prescribing focus, no-focus, split, tab, or other presentation flags in a Herdr profile command.
- Reusing or resuming the conversation of an idle Herdr Agent.
- Supporting Herdr-target profiles in Sync conflict resolution or other non-Ticket agent launches.
- Changing Shortcut execution.
- Making Agent Marker files represent Herdr process lifetime.
- Guaranteeing duplicate prevention across a Herdr-target agent and a separately launched Direct Terminal agent for the same Ticket.
- Remote Herdr servers or named Herdr sessions.

## Further Notes

- The design was checked against Herdr `0.7.4-preview.2026-07-17-813fec141faa`, protocol 16. That version exposes the required workspace list/create/metadata, agent list/start, pane close, pane text, and pane key operations as JSON-producing CLI commands.
- Herdr distinguishes `idle`, `working`, `blocked`, `done`, and `unknown`. Only `idle` is replaceable under this specification.
- The Project path is the Herdr Workspace's base directory; the resolved launch directory remains specific to the Ticket and may be its Agent Worktree.
- The canonical domain terms are Project, Ticket Folder, Agent Worktree, Coding Agent Profile, Launch Target, Herdr Workspace, and Herdr Agent.
