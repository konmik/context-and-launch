# Popups

Coordination of popups and dialogs, including dismissal and focus behavior.

## Specifications

- `S1` Opening a popup closes any other open popup.
- `S2` Opening a dialog closes any open popup.
- `S3` Opening a popup or another dialog does not close or hide existing dialogs.
- `S4` Dialogs appear above application content, and popups appear above dialogs, regardless of loading or rendering timing.
