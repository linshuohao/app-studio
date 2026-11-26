import { createRequire } from 'node:module';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { buildIdentity } from '../../services/api/src/platform/build-identity.ts';
import { buildRetainedWebRuntime } from './build-retained-web-runtime.mjs';

const packageModule = (root, entry) => import(pathToFileURL(join(root, 'dist', entry)).href);
const factory = (key) => 'create' + key[0].toUpperCase() + key.slice(1, -'Manifest'.length);
const assetFile = (owner, target) => {
  const path = relative(dirname(owner), target).replaceAll('\\', '/');
  return path.startsWith('.') ? path : './' + path;
};

export async function prepareRetainedWebAssets({
  archives,
  currentMaterialsRoot,
  moduleFile,
  catalogsFile,
}) {
  const imports = [];
  const registrations = [];
  const catalogs = [];
  const currentStyles = await readFile(join(currentMaterialsRoot, 'dist/styles.css'));

  for (const [index, archive] of archives.entries()) {
    const {
      materialsRoot,
      functionsRoot,
      runtimeRoot,
      runtimeDigest,
      materialsDigest,
      functionsDigest,
    } = archive;
    const archivedResolver = createRequire(join(materialsRoot, 'package.json'));
    const studioResolver = createRequire(join(dirname(moduleFile), 'package.json'));
    for (const dependency of ['react', 'react-dom']) {
      const fromArchive = await realpath(archivedResolver.resolve(dependency + '/package.json'));
      const fromHost = await realpath(studioResolver.resolve(dependency + '/package.json'));
      if (fromArchive !== fromHost)
        throw new Error('Retained materials must share the Studio package: ' + dependency);
    }
    const renderer = '@form-engine/renderer-react/package.json';
    const fromArchive = await realpath(archivedResolver.resolve(renderer));
    const fromHost = await realpath(studioResolver.resolve(renderer));
    if (fromArchive !== fromHost)
      throw new Error('Retained materials must share the Studio Renderer adapter');
    const material = buildIdentity(join(materialsRoot, 'package.json'), 'materials-react');
    const functions = buildIdentity(join(functionsRoot, 'package.json'), 'pure-functions');
    if (material.digest !== materialsDigest || functions.digest !== functionsDigest)
      throw new Error('Retained Web asset package digest does not match');
    if (!(await readFile(join(materialsRoot, 'dist/styles.css'))).equals(currentStyles))
      throw new Error('Retained Web materials must share the deployed stylesheet');

    const engineFile = join(
      dirname(moduleFile),
      basename(moduleFile, '.mjs') + `-runtime-${index}.mjs`,
    );
    await buildRetainedWebRuntime({
      runtimeRoot,
      functionsRoot,
      runtimeDigest,
      functionsDigest,
      output: engineFile,
    });

    const [materialContracts, functionContracts, materialExports, functionExports] =
      await Promise.all([
        packageModule(materialsRoot, 'manifests.js'),
        packageModule(functionsRoot, 'manifests.js'),
        packageModule(materialsRoot, 'index.js'),
        packageModule(functionsRoot, 'index.js'),
      ]);

    function checkedFactories(contracts, exports, artifact, getManifest) {
      return Object.entries(contracts).map(([key, manifest]) => {
        const name = factory(key);
        if (typeof exports[name] !== 'function')
          throw new Error('Missing archived factory: ' + name);
        const binding = exports[name](artifact);
        if (
          !isDeepStrictEqual(getManifest(binding), manifest) ||
          !isDeepStrictEqual(binding.artifact, artifact)
        )
          throw new Error('Archived factory does not match its manifest: ' + name);
        return { name, manifest };
      });
    }

    const materialFactories = checkedFactories(
      materialContracts,
      materialExports,
      material,
      (binding) => binding.contract.manifest,
    );
    const functionFactories = checkedFactories(
      functionContracts,
      functionExports,
      functions,
      (binding) => binding.manifest,
    );
    const core = Object.values(functionExports.createCoreFunctions(functions));
    const catalogEntries = (values, artifact) =>
      Object.fromEntries(values.map(({ manifest }) => [manifest.id, { manifest, artifact }]));
    catalogs.push({
      id: `web:${materialsDigest}:${functionsDigest}`,
      materials: catalogEntries(materialFactories, material),
      pureFunctions: catalogEntries([...core, ...functionFactories], functions),
    });

    imports.push(
      `import * as materials${index} from ${JSON.stringify(assetFile(moduleFile, join(materialsRoot, 'dist/index.js')))};`,
      `import { functions as functions${index}, createRuntime as createRuntime${index} } from ${JSON.stringify(assetFile(moduleFile, engineFile))};`,
    );
    const implementations = (items, source, identity) =>
      items.map(({ name }) => `${source}${index}.${name}(${JSON.stringify(identity)})`).join(', ');
    registrations.push(`{
      materials: Object.fromEntries([${implementations(materialFactories, 'materials', material)}].map(binding => [binding.contract.manifest.id, binding])),
      functions: { ...functions${index}.createCoreFunctions(${JSON.stringify(functions)}),
        ...Object.fromEntries([${implementations(functionFactories, 'functions', functions)}].map(binding => [binding.manifest.id, binding])) },
      runtime: { create: createRuntime${index}, ownsCore: functions${index}.isCoreBinding },
    }`);
  }

  await writeFile(catalogsFile, JSON.stringify(catalogs));
  await writeFile(
    moduleFile,
    `${imports.join('\n')}\nexport const retainedWebCapabilities = [${registrations.join(',\n')}];\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [configuration] = process.argv.slice(2);
  if (!configuration)
    throw new Error('Usage: node prepare-retained-web-assets.mjs <configuration.json>');
  await prepareRetainedWebAssets(JSON.parse(await readFile(configuration, 'utf8')));
}
