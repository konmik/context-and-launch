I want to add interactive review of changes in the UI.

When the user clicks diff review, the app would open a full screen view (similar to forest view) showing every changed file in one continuous scroll, like GitHub's diff view.

The user would be able to select lines with a mouse, the app starts showing a prompt input box popup with the already focused input. When the user enters and presses ok, the prompt will be sent to the agent together with a reference to the selected lines.

The diff would be updated in real time as the agent changes it, but the user would also be able to freeze the diff content. 

Show a hierarchical tree of expandable and collapsible repository directories and changed files on the left. Selecting a file scrolls the continuous diff to that file without hiding the other files. As Agent changes files, highlight these changes so the user can see where to focus and review again.

Highlight changes that were not reviewed yet, and if an agent changes them again in real time, highlight them again.

The user should be able to change the mode, which selects changes to review. It can be:
- all uncommitted changes
- all commits in the current branch plus uncomitted changes
- the last commit
