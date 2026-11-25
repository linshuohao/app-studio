import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyManifestExports } from './packed-asset-exports.mjs';

const registered = { textInputManifest: 'text-input', arrayEditorManifest: 'array-editor' };
const actual = {
  textInputManifest: { id: 'text-input' },
  arrayEditorManifest: { id: 'array-editor' },
};

test('checks registered manifest names and IDs against the packed namespace', () => {
  verifyManifestExports('materials-react', actual, registered);
  assert.throws(
    () =>
      verifyManifestExports(
        'materials-react',
        { textInputManifest: actual.textInputManifest },
        registered,
      ),
    /materials-react.*arrayEditorManifest.*array-editor/s,
  );
  assert.throws(
    () =>
      verifyManifestExports(
        'materials-react',
        { ...actual, arrayEditorManifest: { id: 'old' } },
        registered,
      ),
    /materials-react.*arrayEditorManifest.*array-editor/s,
  );
});
