---
status: accepted
---

# Keep one persistent Herdr pane per Ticket

Each Ticket reuses one pane owned by a persistent PowerShell process. A later launch stops an `idle` or `done` agent child and starts a fresh agent in that pane; it never closes the pane, creates another pane, or reuses the old agent session.

Released Herdr cannot yet start an agent in an existing pane. [`run-agent-herdr.ps1`](../../config-defaults/run-agent-herdr.ps1) temporarily manages the child process and passes the multiline prompt as its positional argument. Working or unsafe agent states reject the launch.

When a Herdr release includes [`e0758c3`](https://github.com/ogulcancelik/herdr/commit/e0758c32118f2aa006db3d8fa4b41833fe6e7ead), replace the workaround with native `agent start --pane` followed by `agent prompt`, while preserving the same pane-reuse behavior.
