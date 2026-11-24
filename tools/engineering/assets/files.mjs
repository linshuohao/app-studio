import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, lstat, mkdir, writeFile, rename, rm, rmdir } from 'node:fs/promises';
import { resolve, relative, dirname, sep, join } from 'node:path';
import { execFileSync } from 'node:child_process';

export const digest = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
export const json = (value) => JSON.stringify(value, null, 2) + '\n';
export async function withWorkspaceLock(root, operation) {
  const path = await safePath(root, '.changeset/.asset-tool.lock');
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, json({ pid: process.pid }), { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST')
      throw Error(
        'Another asset operation holds .changeset/.asset-tool.lock; check it before removing a stale lock.',
      );
    throw error;
  }
  try {
    return await operation();
  } finally {
    await rm(path);
  }
}
export async function read(root, file) {
  try {
    return await readFile(resolve(root, file), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
/** Refuse path traversal and symlink ancestors before touching any workspace path. */
export async function safePath(root, file) {
  const path = resolve(root, file),
    rel = relative(resolve(root), path);
  if (!rel || rel.startsWith('..' + sep) || rel === '..') throw Error(`Unsafe path: ${file}`);
  let current = resolve(root);
  for (const part of rel.split(sep)) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw Error(`Symlink path rejected: ${file}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return path;
}
export async function walk(root, prefix = '') {
  const files = [];
  let entries;
  try {
    entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return files;
    throw error;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (['node_modules', 'dist', '.next', '.turbo', '.git', 'coverage'].includes(entry.name))
      continue;
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw Error(`Symlink path rejected: ${file}`);
    if (entry.isDirectory()) files.push(...(await walk(root, file)));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}
export function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
export function baseCommit(root, base) {
  if (!base || base.startsWith('-')) throw Error('An explicit --base Git revision is required.');
  return git(root, 'rev-parse', '--verify', `${base}^{commit}`);
}
export function baseFiles(root, base) {
  return git(root, 'ls-tree', '-r', '--name-only', base, '--', 'packages')
    .split('\n')
    .filter(Boolean);
}
export function baseRead(root, base, file) {
  try {
    return execFileSync('git', ['show', `${base}:${file}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}
/** Validate all preimages before writes, replace individual files atomically, roll back only our writes. */
export async function applyEdits(root, edits, verify) {
  const done = [],
    createdDirs = [];
  for (const edit of edits) {
    await safePath(root, edit.path);
    if ((await read(root, edit.path)) !== edit.before) throw Error(`Stale file: ${edit.path}`);
  }
  try {
    for (const edit of edits) {
      const path = await safePath(root, edit.path);
      if ((await read(root, edit.path)) !== edit.before) throw Error(`Stale file: ${edit.path}`);
      const missing = [];
      let dir = dirname(path);
      while (dir !== resolve(root)) {
        try {
          await lstat(dir);
          break;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          missing.push(dir);
          dir = dirname(dir);
        }
      }
      for (const directory of missing.reverse()) {
        await mkdir(directory);
        createdDirs.push(directory);
      }
      if (edit.after === null) await rm(path);
      else {
        const temporary = `${path}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, edit.after, { flag: 'wx' });
          await rename(temporary, path);
        } finally {
          await rm(temporary, { force: true });
        }
      }
      done.push(edit);
    }
    return await verify?.();
  } catch (error) {
    const conflicts = [];
    for (const edit of done.reverse()) {
      if ((await read(root, edit.path)) !== edit.after) {
        conflicts.push(edit.path);
        continue;
      }
      if (edit.before === null) await rm(resolve(root, edit.path), { force: true });
      else await writeFile(resolve(root, edit.path), edit.before);
    }
    for (const dir of createdDirs.reverse()) await rmdir(dir).catch(() => {});
    if (conflicts.length)
      throw Error(`Recovery conflict; preserve concurrent changes in ${conflicts.join(', ')}`, {
        cause: error,
      });
    throw error;
  }
}
