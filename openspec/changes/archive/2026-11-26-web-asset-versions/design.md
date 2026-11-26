## Context

Before this change, Platform took its capability catalog from the installed packages. Prepared already stores an exact lock. The [confirmed design](../../../../docs/design/platform-studio.md#platform-asset-versions) defines selection and compatibility.

## Decisions

- Resolve archived implementation registrations before instance creation. Runtime and Renderer retain their existing verification and receive only the selected registrations.
- Keep revision dependency metadata separate from Definition. Freeze the resolved compiler catalog for publication.
- Verify old and new behavior against separate release identities with the same upgraded deployment.

## Implementation evidence

Platform persists Web bindings in each revision and resolves same-revision legacy release evidence on read. Explicit choices are applied within a profile, and drafting, checking, capture and publication resolve the same identities. Inspection protects saves against recommendation changes. Independent draft preview receipts also pin the choices they evaluated.

The controlled-build preparation command generates both static catalogs and Studio registration modules from verified archives. The retained runtime bundle resolves its own immutable pure function package and preserves its private core ownership check. Materials share React, the Renderer adapter and the deployed stylesheet. A field and its context-dependent control must have matching material artifacts. Platform and Web Host reject unsupported combinations.

The isolated packed upgrade test uses real compiled variants of the material and pure function packages. It publishes under the previous catalog, upgrades the running test API, republishes the retained revision, opens both releases in the upgraded Studio, checks editing and the accessibility association, compares function results, and saves an explicit upgrade in the Studio version picker. The variants are produced in a disposable checkout and are not deployed production packages.
