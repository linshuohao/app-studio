import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { createAsset } from './create.mjs';
import { writeAssetChange } from './change.mjs';
import { checkAssets } from './check.mjs';
import { createReleasePlan } from '../release/plan.mjs';
import { applyReleasePlan } from '../release/apply.mjs';
import { checkRelease } from '../release/check.mjs';
import { json } from './files.mjs';

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: 'string' },
      id: { type: 'string' },
      package: { type: 'string' },
      base: { type: 'string' },
      bump: { type: 'string' },
      summary: { type: 'string' },
      plan: { type: 'string' },
      output: { type: 'string' },
      'dry-run': { type: 'boolean' },
      'no-release': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  const [command, kind, ...extra] = positionals;
  if (values.help) {
    console.log(
      'asset:new material|function --id ID [--dry-run]\nasset:change (--id ID | --package NAME) (--bump patch|minor|major | --no-release) --summary TEXT\nassets:check [--base REF]\nrelease:plan --base REF [--output NEW_JSON_PATH]\nrelease:apply|release:check --plan JSON_PATH\nAll commands accept --root PATH. Planning never publishes.',
    );
  } else {
    if (extra.length || (kind && command !== 'new'))
      throw Error('Unexpected positional arguments.');
    const allowed = {
      new: ['root', 'id', 'dry-run'],
      change: ['root', 'id', 'package', 'bump', 'summary', 'no-release'],
      check: ['root', 'base'],
      plan: ['root', 'base', 'output'],
      apply: ['root', 'plan'],
      'release-check': ['root', 'plan'],
    };
    for (const option of Object.keys(values))
      if (!allowed[command]?.includes(option))
        throw Error(`Unsupported --${option} for ${command}`);
    if (values['no-release'] && values.bump)
      throw Error('Choose --bump or --no-release, not both.');
    const root = resolve(values.root ?? process.cwd());
    let result;
    if (command === 'new')
      result = await createAsset({ root, kind, id: values.id, dryRun: values['dry-run'] });
    else if (command === 'change') {
      let summary = values.summary;
      if (!summary && process.stdin.isTTY) {
        const prompt = createInterface({ input: process.stdin, output: process.stdout });
        try {
          summary = await prompt.question('变更理由 / 兼容影响 / 必要迁移说明：');
        } finally {
          prompt.close();
        }
      }
      result = await writeAssetChange({
        root,
        id: values.id,
        packageName: values.package,
        bump: values.bump,
        summary,
        noRelease: values['no-release'],
      });
    } else if (command === 'check') {
      result = await checkAssets({
        root,
        base: values.base ?? process.env.ASSET_BASE_REF ?? 'HEAD',
      });
      if (result.errors.length) throw Error(result.errors.join('\n'));
      result = { base: result.base, assets: result.assets.map((a) => a.id), status: 'passed' };
    } else if (command === 'plan') result = await createReleasePlan({ root, base: values.base });
    else if (command === 'apply' || command === 'release-check') {
      if (!values.plan) throw Error('--plan JSON_PATH is required.');
      const plan = JSON.parse(await readFile(resolve(values.plan), 'utf8'));
      result =
        command === 'apply'
          ? await applyReleasePlan({ root, plan })
          : await checkRelease({ root, plan });
    } else throw Error('Unknown command; use --help.');
    if (values.output) {
      if (command !== 'plan') throw Error('--output is only supported by release:plan.');
      await writeFile(resolve(values.output), json(result), { flag: 'wx' });
      console.log(json({ output: resolve(values.output), digest: result.digest }));
    } else console.log(json(result));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
