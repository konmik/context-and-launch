Since commit 837bd60 (Pass initial prompts as agent arguments), run-agent.ps1 and run-agent.sh append the prompt to the claude CLI argv. Claude Code processes the initial CLI prompt before the skills list is loaded into context, so skills referenced in the prompt are not triggered on the first turn.

Confirmed: the same prompt triggers the skill when entered as a second message in an already-running session.

Related upstream issue: https://github.com/anthropics/claude-code/issues/75224

Fix: deliver the prompt to an already-initialized session instead of passing it as a CLI argument, or find another way to make skill invocation from the initial prompt reliable.
