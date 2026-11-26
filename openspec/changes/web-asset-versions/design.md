## Context

Platform currently takes its capability catalog from the installed packages. Prepared already stores an exact lock. The [confirmed design](../../../docs/design/platform-studio.md#platform-asset-versions) defines selection and compatibility.

## Decisions

- Resolve archived implementation registrations before instance creation. Runtime and Renderer retain their existing verification and receive only the selected registrations.
- Keep revision dependency metadata separate from Definition. Freeze the resolved compiler catalog for publication.
- Verify old and new behavior against separate release identities with the same upgraded deployment.

## Current implementation

The API can read retained static snapshots from `PLATFORM_RETAINED_WEB_CATALOGS_FILE`. Each snapshot contains the asset maps and their exact Web artifact identities. The installed catalog supplies the default rows. Clients can request `allVersions=true` and query exact detail by version and artifact digest. The revision evidence endpoint inspects only publications of the requested revision and reports unique, ambiguous and unobserved evidence.

The Studio build can supply a trusted local module via `STUDIO_RETAINED_WEB_CAPABILITIES_MODULE`, relative to the Studio build workspace. The module exports `retainedWebCapabilities`; each set provides material and function registrations. The current installed set remains available. A deployment must supply matching static manifests and implementation bindings from the verified retained packages. These inputs are distinct from the planned CI retention pipeline.

An independent review reproduced a reserved core binding failure when functions originate in a separate module instance. Host now refuses such a release before mount. Real compatibility still needs a build configuration that supplies a Runtime compatible with the retained core implementation. Mixing material package instances also needs an explicit compatibility check for shared contexts such as FieldContext. Fixture releases exercise locked assembly and rendering, and do not exercise these archive package compatibility requirements.
