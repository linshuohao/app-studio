## ADDED Requirements

### Requirement: A checked Data Schema precedes fragment authoring

The staged PRD path SHALL check Schema executability and the supplied data cases before generating fragments. The assembler SHALL own data.schema and submit the resulting complete definition to the existing Compiler.

#### Scenario: A compiler finding belongs to the view

- **WHEN** schema checks pass and the assembled form has a view diagnostic
- **THEN** the view step receives the finding and the next candidate retains the checked Data Schema and the sibling fragments

#### Scenario: A fragment cannot complete a member deletion action

- **WHEN** Reaction identifies that its required behavior is direct user deletion of a scoped array member
- **THEN** View owns the activation command and Reaction retains its other behavior
- **AND** if the new View is still incomplete, the partial draft retains the checked Schema and the last usable View, and identifies the unmet requirement for editing

#### Scenario: A user edits the partial draft

- **WHEN** the user saves manual changes and requests Agent follow-up using the draft ID and revision
- **THEN** Platform forwards the saved text for that revision
- **AND** a delivery based on an older revision cannot overwrite the new draft

#### Scenario: A person and an Agent both request editing the same draft

- **WHEN** either party already holds editing rights and another party requests to change the same draft
- **THEN** Platform rejects the later request and records a notice for the current holder
- **AND** a rejected Agent request never starts generation

#### Scenario: The editor closes without releasing

- **WHEN** the fixed editing grant expires
- **THEN** either party can obtain a fresh grant
- **AND** the previous grant cannot save, deliver, or release the fresh grant
