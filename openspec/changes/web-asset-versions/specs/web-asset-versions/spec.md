## ADDED Requirements

### Requirement: Web releases resolve locked implementations

An upgraded Host SHALL resolve the exact retained material and function implementations identified by each release.

#### Scenario: Two releases use different implementations

- **WHEN** both retained releases are opened after a platform asset upgrade
- **THEN** each executes with the material and function implementation specified by its own lock

#### Scenario: Locked implementation is unavailable

- **WHEN** the Host cannot match a locked implementation
- **THEN** it reports the missing identity and refuses to create that form instance

### Requirement: Configuration revisions retain asset selections

The Platform SHALL apply the confirmed Web authoring and historical binding behavior.

#### Scenario: A legacy revision has ambiguous evidence

- **WHEN** multiple published asset selections are attributable to the same revision and target
- **THEN** the affected dependency is pending binding until explicitly selected
