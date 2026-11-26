## Why

Web deployments must preserve the implementations selected by older form revisions and publications when the recommended assets change.

## What Changes

Implement the confirmed [Platform asset version contract](../../../docs/design/platform-studio.md#platform-asset-versions) for Web. Verify simultaneous old and new publication execution after upgrade. Remote module delivery remains a separate design topic.

## Capabilities

### New Capabilities

- `web-asset-versions` — Exact Web capability resolution and configuration binding.

### Modified Capabilities

None.

## Impact

Platform catalog, revision storage, authoring checks, Studio authoring and Host assembly.
