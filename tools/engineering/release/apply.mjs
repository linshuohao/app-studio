import { checkRelease } from './check.mjs';
import { createReleasePlan } from './plan.mjs';
import { applyEdits, withWorkspaceLock } from '../assets/files.mjs';

export async function applyReleasePlan({ root, plan }) {
  return withWorkspaceLock(root, () => apply({ root, plan }));
}
async function apply({ root, plan }) {
  const status = await checkRelease({ root, plan });
  if (status.status === 'applied')
    throw Error('Release plan already applied; versions are unchanged.');
  const actual = await createReleasePlan({ root, base: plan.base });
  if (actual.digest !== plan.digest)
    throw Error('Invalid plan: recomputed Changesets output differs.');
  return applyEdits(root, plan.files, () => checkRelease({ root, plan }));
}
