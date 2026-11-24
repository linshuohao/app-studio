## ADDED Requirements
### Requirement: Readable immutable version names
Studio SHALL allow an optional single-line version name up to 80 characters and show readable names without replacing stable identities.
#### Scenario: Retry a named save
- WHEN the same save key is retried with the same name and content
- THEN it returns the original version; a changed name conflicts.
#### Scenario: Legacy records
- WHEN an existing unnamed version or release is read
- THEN its data remains intact and the interface uses a readable time or note fallback.
### Requirement: Version matched capability descriptions
Catalogs SHALL combine actual schemas with version-matched human descriptions and display Host request inputs and outputs as field tables.
#### Scenario: Existing release compatibility
- WHEN catalog descriptions are added
- THEN runtime manifests, artifacts and existing published locks remain unchanged.
#### Scenario: Nested request fields
- WHEN remote-select is inspected
- THEN query, filterKey, items and item id/label show meaning, type and constraints.
### Requirement: Compact consistent controls
Studio SHALL use shared dropdown controls and content-sized material previews without clipping complex materials.
#### Scenario: Dialog dropdown
- WHEN a JSON value type or publishing profile is selected inside a dialog
- THEN the popup remains interactive within the dialog and selection can be completed.
