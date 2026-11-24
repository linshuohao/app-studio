## ADDED Requirements
### Requirement: Current authorization and last administrator
Member changes SHALL recheck current administrative authorization and retain an active administrator atomically.
#### Scenario: Last administrator deactivation
- WHEN a change would leave no enabled administrator
- THEN it fails with 409 and no mutation or audit entry is committed.
### Requirement: Existing account association
Administrators SHALL associate existing active verified accounts without creating new credentials.
#### Scenario: Unknown username
- WHEN an administrator submits an unknown username
- THEN no account or member is created and the response is 404.

### Requirement: Administrator-provisioned account and self-service password
Administrators SHALL explicitly attest identity verification when creating a built-in account with an initial password. Members SHALL verify their current password to change it.
#### Scenario: Duplicate account
- WHEN creation uses an existing username
- THEN it fails atomically without changing the existing credentials.
#### Scenario: Password rotation
- WHEN a member successfully changes their password
- THEN other sessions are revoked, the initiating session is retained and old credential proofs cannot commit subsequent login or binding operations.
