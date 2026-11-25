## ADDED Requirements

### Requirement: A checked Data Schema precedes fragment authoring

The staged PRD path SHALL check Schema executability and the supplied data cases before generating fragments. The assembler SHALL own data.schema and submit the resulting complete definition to the existing Compiler.

#### Scenario: A compiler finding belongs to the view

- **WHEN** schema checks pass and the assembled form has a view diagnostic
- **THEN** the view step receives the finding and the next candidate retains the checked Data Schema and the sibling fragments
