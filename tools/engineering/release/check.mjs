import { inputFiles, fingerprint, planDigest } from './plan.mjs';

export async function checkRelease({ root, plan }) {
  if (plan?.schemaVersion !== 1 || plan.digest !== planDigest(plan) || !Array.isArray(plan.files))
    throw Error('Invalid plan digest; plan may have been tampered with.');
  const current = fingerprint(await inputFiles(root));
  if (JSON.stringify(current) === JSON.stringify(plan.inputs)) return { status: 'ready' };
  const expected = { ...plan.inputs };
  for (const edit of plan.files) {
    if (edit.after === null) delete expected[edit.path];
    else expected[edit.path] = fingerprint({ [edit.path]: edit.after })[edit.path];
  }
  const sorted = (data) =>
    JSON.stringify(
      Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b, 'en'))),
    );
  if (sorted(current) === sorted(expected)) return { status: 'applied' };
  throw Error('Stale release plan: workspace inputs have changed.');
}
