## ADDED Requirements

### Requirement: Studio edits definition constraints

Studio SHALL edit internal and external constraints in the shared form definition draft as described in `docs/design/platform-studio.md#studio-constraint-visual`.

#### Scenario: Synchronous prerequisites use compiler binding

- **WHEN** an editor adds a field prerequisite or selects an internal rule prerequisite
- **THEN** Studio checks the candidate through Compiler before applying it to the shared draft

#### Scenario: Rule changes surface binding impact

- **WHEN** an editor previews a delete, kind change, or scope change
- **THEN** Studio shows affected prerequisite bindings or Compiler diagnostics before application
