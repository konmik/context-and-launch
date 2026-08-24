---
status: accepted
---

# Keep one persistent Herdr pane per Ticket

Each Ticket reuses one pane owned by a persistent shell. The `{projectSlug}--{folderName}` pane label is the persistent Ticket identity. A later launch stops an `idle` or `done` agent child and starts a fresh agent in that pane; it never closes the pane, creates another pane, or reuses the old agent session.

Herdr releases containing [`e0758c3`](https://github.com/ogulcancelik/herdr/commit/e0758c32118f2aa006db3d8fa4b41833fe6e7ead) support this lifecycle natively. [`run-agent-herdr.ps1`](../../config-defaults/run-agent-herdr.ps1) creates or selects the Ticket pane and runs the Coding Agent Profile's exact command through that pane's shell. This avoids Herdr's Windows `Start-Process` launcher selecting extensionless npm shims instead of runnable `.cmd` or `.exe` files, and preserves custom executable names rather than replacing them with a canonical agent-kind command. The argv is UTF-16LE encoded into a single-line PowerShell `-EncodedCommand` payload, Herdr auto-detects the resulting agent, and the script restores the transient Agent name and persistent Ticket pane label before submitting the initial prompt with `agent prompt`. Agent names are transient launch handles derived from pane IDs. Working or unsafe agent states reject the launch.

Status and cleanup operations resolve Ticket pane labels and join live agents by pane ID. They do not infer persistent Ticket identity from transient agent names or working directories.
