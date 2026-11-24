# __ID__

This asset is a scaffold, not an implemented capability.

Complete the manifest and document its valid inputs, invalid working values,
return or handoff behavior, boundaries, errors and examples before release.
Replace the TODO tests with behavior tests. Release planning rejects unfinished scaffolds.

The manifest is the sole machine contract. Keep runtime code out of the static
manifest entry. Implementations receive a real immutable artifact identity from
the Host build; do not invent a digest or write directly to Runtime internals.
