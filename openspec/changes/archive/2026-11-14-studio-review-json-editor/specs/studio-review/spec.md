## ADDED Requirements
### Requirement: Shared JSON node authoring
Studio SHALL reuse a tree viewer/editor for all JSON documents and validate syntax before saving the current edited buffer in compact form.
#### Scenario: Edit a value
- WHEN a user changes a nested property through the viewer
- THEN only that node changes, untouched number and escape lexemes remain exact, and undo restores the previous buffer.
#### Scenario: Invalid source
- WHEN an edited buffer is invalid JSON
- THEN Studio retains it for repair and refuses a new save; legacy API/history remains readable.
### Requirement: Explicit publishing and durable navigation
Studio SHALL bind publishing to an explicit version and Web view and keep page URLs aligned with the selected resource.
#### Scenario: Unknown release
- WHEN a URL specifies an unknown release
- THEN no different release is substituted or linked as its Host result.
#### Scenario: Late response
- WHEN a user goes back while another form is loading
- THEN the late response does not override the destination or leave navigation disabled.
### Requirement: Complete supporting pages
Studio SHALL expose actual catalog information, actionable member feedback and explicit Host instance controls.
#### Scenario: Reuse release
- WHEN the same release is loaded again
- THEN its existing instance is selected unless the user explicitly creates an independent instance.

### Requirement: Formatted object editing and bounded layout
Studio SHALL show object and array node values using four-space indentation and validate the node type before applying edits. Controls SHALL remain legible across desktop, narrow and short viewports with local scrolling for long data.
#### Scenario: Change an object
- WHEN an object node editor opens
- THEN its JSON is formatted and editable, invalid syntax or an array replacement is rejected for object type, and persisted JSON is compact.
### Requirement: Optional immutable release names
Publishing SHALL accept an optional single-line display name up to 80 characters, freeze it in the accepted request and successful release, and display it in Studio and the public Host.
#### Scenario: Replay a named release
- WHEN a request key is replayed with a different name
- THEN it conflicts; unchanged input returns the original release and original name.
#### Scenario: Upgrade existing releases
- WHEN nullable naming columns are added to an existing database
- THEN prior forms, versions, release payloads, digests and unnamed-request fingerprints remain unchanged.
