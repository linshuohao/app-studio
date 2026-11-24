#!/usr/bin/env python3
"""Thin OpenSpec adapter. Run from repository root; commands are argv arrays."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def run(argv):
    subprocess.run(argv, check=True, env={**os.environ, 'OPENSPEC_TELEMETRY': '0', 'DO_NOT_TRACK': '1'})


def digest(root, change, config):
    files = set()
    # Execution inputs are always covered, independently of the task's scope.
    execution = ['openspec/config.yaml', 'openspec/schemas', 'tools/engineering/workflow.py']
    for name in config['authority'] + config['scope'] + execution + [str(change.relative_to(root))]:
        path = Path(os.path.abspath(root / name))
        if not path.is_relative_to(root):
            raise ValueError('Scope escapes repository')
        # Reject links rather than silently omitting directory-link targets.
        for part in [path, *path.parents]:
            if part == root:
                break
            if part.is_symlink():
                raise ValueError(f'Symlink is not supported in evidence scope: {part}')
        if not path.exists():
            raise ValueError(f'Missing scope: {name}')
        for candidate in (path.rglob('*') if path.is_dir() else [path]):
            if candidate.is_symlink():
                raise ValueError(f'Symlink is not supported in evidence scope: {candidate}')
            if candidate.is_file():
                files.add(candidate)
    entries = []
    for path in sorted(files):
        if path == change / '.workflow-evidence.json':
            continue
        entries.append((str(path.relative_to(root)), hashlib.sha256(path.read_bytes()).hexdigest()))
    return hashlib.sha256(json.dumps(entries, ensure_ascii=False).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['verify', 'resume', 'invalidate', 'archive'])
    parser.add_argument('change')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', args.change):
        raise ValueError('Invalid change name')
    root = Path.cwd().resolve()
    change = root / 'openspec/changes' / args.change
    if not change.is_dir():
        raise ValueError('Active change not found; inspect archive before retrying')
    receipt = change / '.workflow-evidence.json'
    if args.action == 'resume':
        run(['openspec', 'instructions', 'apply', '--change', args.change, '--json'])
        print('Recheck Git baseline, authority, pending tasks, and stale review evidence before resuming.')
        return
    if args.action == 'invalidate':
        receipt.unlink(missing_ok=True)
        print('Evidence invalidated. Reopen affected tasks; record reason and confirmation in design.md; preserve unaffected tasks.')
        return
    if args.action == 'verify':
        receipt.unlink(missing_ok=True)
    config = json.loads((change / 'workflow.json').read_text())
    if not config.get('authority') or not config.get('scope') or not config.get('checks'):
        raise ValueError('authority, scope and checks must be nonempty')
    if not all(isinstance(x, str) and (root / x).resolve().is_relative_to(root / 'docs/design') and (root / x).is_file() for x in config['authority']):
        raise ValueError('Authority must reference docs/design files (without anchors)')
    if (root / 'openspec/specs').exists() and any(p.is_file() and p.name != '.gitkeep' for p in (root / 'openspec/specs').rglob('*')):
        raise ValueError('Parallel main specifications are forbidden')
    run(['openspec', 'validate', args.change, '--strict'])
    if args.action == 'verify':
        receipt.unlink(missing_ok=True)
        before = digest(root, change, config)
        for command in config['checks']:
            if not isinstance(command, list) or not command or not all(isinstance(x, str) for x in command):
                raise ValueError('Each check must be a nonempty argv array')
            run(command)
        if digest(root, change, config) != before:
            raise ValueError('Checks mutated scope; generate before verification and rerun all checks')
        receipt.write_text(json.dumps({'fingerprint': digest(root, change, config), 'checks': config['checks']}, ensure_ascii=False, indent=2) + '\n')
        print('Verification recorded; this is execution evidence, not design approval or independent review.')
        return
    evidence = json.loads(receipt.read_text())
    if evidence['fingerprint'] != digest(root, change, config):
        raise ValueError('Stale evidence: reverify after scope/authority/task changes')
    progress = subprocess.check_output(['openspec', 'instructions', 'apply', '--change', args.change, '--json'], env={**os.environ, 'OPENSPEC_TELEMETRY': '0'})
    state = json.loads(progress)
    if not state.get('taskTrackingConfigured') or state['progress']['total'] == 0 or state['progress']['remaining']:
        raise ValueError('Tracked tasks must be nonempty and complete before archive')
    # No canonical-spec merge: current contracts were maintained through form-workflow knowledge maintenance.
    run(['openspec', 'archive', args.change, '--skip-specs', '--yes'])


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(f'Workflow stopped: {error}', file=sys.stderr)
        sys.exit(1)
