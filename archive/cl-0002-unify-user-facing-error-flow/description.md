We need to have a single error type that can be returned for all user-facing errors. It will be the same structure, it will have: title, description, optional details, optional field.

If the error pops up in a dialog with a matching field, it would show the description under the field. The error element must have a ? button with clicking on it the user would be represented with the complete information about the error.
Else: if the error pops up in the interactive UI that waits for the completion of the action, then show a pop-up error dialog showing complete error information.
Else: show the error in a toast.
