import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Resolve the installed CLI's declared dependencies through public package exports.
// Keep all coupling to the locked Changesets distribution in this adapter.
const require = createRequire(import.meta.resolve('@changesets/cli'));
export async function changesets() {
  const load = (name) => import(pathToFileURL(require.resolve(name)));
  const [assembler, applier, reader, config, packages, semver] = await Promise.all([
    load('@changesets/assemble-release-plan'),
    load('@changesets/apply-release-plan'),
    load('@changesets/read'),
    load('@changesets/config'),
    load('@manypkg/get-packages'),
    load('semver'),
  ]);
  const parseRequire = createRequire(require.resolve('@changesets/read'));
  const parser = await import(pathToFileURL(parseRequire.resolve('@changesets/parse')));
  return {
    assemble: assembler.assembleReleasePlan ?? assembler.default,
    apply: applier.applyReleasePlan,
    read: reader.readChangesets,
    readConfig: config.readConfig,
    getPackages: packages.getPackages,
    semver: semver.default,
    parse: parser.parseChangesetFile,
  };
}
