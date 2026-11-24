## ADDED Requirements
### Requirement: Readable and lossless JSON presentation
Studio SHALL format valid JSON on load and paste and expose foldable object/array reading without mutating persisted historical versions.
#### Scenario: Large formatted display
- WHEN a saved compact document is within the storage limit but indentation exceeds it
- THEN Studio displays formatted text and saves only original tokens without outside whitespace.
#### Scenario: Invalid document
- WHEN JSON syntax is invalid
- THEN the original text remains available and is saved unchanged.
### Requirement: Browse history without discarding draft
Studio SHALL retain current editing buffers and pending save requests while browsing history.
#### Scenario: Return to editing
- WHEN a user reads a history version and returns to the configuration workspace
- THEN their draft and note remain intact.
