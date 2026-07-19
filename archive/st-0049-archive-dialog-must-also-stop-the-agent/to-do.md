Add a toggle to stop the agent if it is in herdr.

Do not write big features such as herdr menager, it is a small feature that runs a small command to check first (already exists) and then kills it off if the user checked it.

Also refactor the archive process.
When opening a dialog, start checks and show progress for each checkbox.
When the status is comfirmed, if it is possible to do the cleanup, make the checkbox enabled.

Review the code on the archive dialog and improve its architecture to match the new workflow.