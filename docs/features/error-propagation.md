# Error propagation

User-facing errors are presented with consistent information in the appropriate field, dialog, or toast.

## Specifications

- `S1` Operations other than low-level file operations return user-facing errors from the point where the failure originates.
- `S2` Low-level file operation errors are converted into user-facing errors at the earliest point where their user-facing meaning is known.
- `S3` When an operation fails while its UI is present and waiting for completion, show the error at the matching field if one exists.
- `S4` When an operation fails while its UI is present and waiting for completion, show an error dialog if no matching field exists.
- `S5` When an asynchronous operation fails without its corresponding UI present and waiting for completion, show the error in a toast.
