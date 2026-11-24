## ADDED Requirements
### Requirement: Authorized installed catalog
The API SHALL return only currently installed asset contracts to authorized viewers.
#### Scenario: Exact version
- WHEN a viewer requests an unknown version
- THEN the API returns 404 instead of another version.
### Requirement: Linear Studio
The Studio SHALL present forms, editors and directories using the user-selected Linear visual direction.
#### Scenario: Shared navigation
- WHEN a user navigates to either catalog
- THEN real API entries and exact manifest details are displayed with source documentation when available.
