import assert from 'node:assert/strict';

export function verifyManifestExports(packageName, actual, expected) {
  for (const [exportName, id] of Object.entries(expected)) {
    assert.equal(actual[exportName]?.id, id, `${packageName}: ${exportName} must export ${id}`);
  }
  assert.deepEqual(
    Object.keys(actual).sort(),
    Object.keys(expected).sort(),
    `${packageName}: packed manifest exports differ from the source registry`,
  );
}
