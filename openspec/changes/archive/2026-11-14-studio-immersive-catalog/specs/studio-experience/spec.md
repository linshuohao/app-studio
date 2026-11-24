## ADDED Requirements
### Requirement: Readable JSON text
Studio SHALL automatically show valid JSON with four-space indentation when opening text mode, preserve token spelling and invalid source, and retain semantic save/check state for formatting-only changes.
#### Scenario: Read compact catalog JSON
- WHEN a user opens formatted text for a catalog manifest
- THEN nested objects are indented without requiring a format action.
### Requirement: Immersive form workbench
Studio SHALL hide global navigation and account actions while a form is open and retain a return action with unsaved and pending request protection.
#### Scenario: Cancel leaving
- WHEN a user cancels returning with unsaved edits
- THEN the form and edits remain in the immersive workbench.
### Requirement: Classified catalog with real previews
Catalogs SHALL expose independent purpose and implementation metadata for actual installed assets. Material details SHALL show isolated interactive examples where a compatible fixture exists.
#### Scenario: Inspect an input
- WHEN a user selects input and React filters and opens text-input
- THEN the matching installed asset renders using its actual material implementation, and reset restores example data without changing saved forms.
#### Scenario: Future implementations
- WHEN Vue or Flutter assets are not installed
- THEN they are not presented as currently usable assets; available filter choices derive from returned metadata.
