---
status: accepted
---

# Keep one persistent Herdr pane per Ticket

Each Ticket reuses one pane owned by a persistent shell. The `{projectSlug}--{folderName}` pane label is the persistent Ticket identity. A later launch stops an `idle` or `done` agent child and starts a fresh agent in that pane; it never closes the pane, creates another pane, or reuses the old agent session.

Herdr releases containing [`e0758c3`](https://github.com/ogulcancelik/herdr/commit/e0758c32118f2aa006db3d8fa4b41833fe6e7ead) support this lifecycle natively. [`run-agent-herdr.ps1`](../../config-defaults/run-agent-herdr.ps1) creates or selects the Ticket pane, labels it, starts the configured agent kind with `agent start --pane`, and submits the initial prompt with `agent prompt`. OpenCode 2 preview is the exception: Herdr recognizes it as OpenCode but its canonical launcher always executes stable `opencode`, so the script runs the configured `opencode2` command in the pane with OpenCode's `--prompt` startup option and then binds the detected agent. The PowerShell command is UTF-16LE encoded into a single-line `-EncodedCommand` payload so multiline prompts never become interactive shell input. OpenCode 2 populates rather than submits the startup prompt, and can ignore Enter while cold-start initialization is incomplete, so the launcher retries Enter until Herdr observes a state transition. Agent names are transient launch handles derived from pane IDs. Working or unsafe agent states reject the launch.

Status and cleanup operations resolve Ticket pane labels and join live agents by pane ID. They do not infer persistent Ticket identity from transient agent names or working directories.
