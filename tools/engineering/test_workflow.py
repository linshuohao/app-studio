import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

import tempfile
import shutil
source_adapter = Path(__file__).with_name('workflow.py').resolve()
adapter = source_adapter
project = adapter.parents[2]
sandbox = tempfile.TemporaryDirectory(prefix='form-openspec-test-')
os.chdir(sandbox.name)
Path('tools/engineering').mkdir(parents=True)
shutil.copy2(source_adapter, 'tools/engineering/workflow.py')
adapter = Path('tools/engineering/workflow.py').resolve()
Path('docs/design').mkdir(parents=True)
Path('docs/design/example.md').write_text('# Contract\n\nOnly current request publishes.\n')
shutil.copytree(project / 'openspec/schemas/form-change', Path('openspec/schemas/form-change'))
Path('openspec/config.yaml').write_text('schema: form-change\n')
p = Path('openspec/changes/isolated-check')
(p/'specs/request').mkdir(parents=True)
(p/'.openspec.yaml').write_text('schema: form-change\ncreated: 2026-11-02\n')
(p/'proposal.md').write_text('# Proposal\n\n## Why\nVerify fixture.\n\n## What Changes\nRequest eligibility.\n\n## Impact\nFixture only; docs/design/example.md\n')
(p/'design.md').write_text('# Design\nAuthority: docs/design/example.md\n')
(p/'specs/request/spec.md').write_text('## ADDED Requirements\n\n### Requirement: Eligible request\nThe system SHALL publish the current request only.\n\n#### Scenario: Stale request\n- **WHEN** stale request completes\n- **THEN** ignore it\n')
(p/'tasks.md').write_text('# Tasks\n- [x] 1.1 Identity\n- [ ] 1.2 Out of order\n')
(p/'workflow.json').write_text(json.dumps({'authority':['docs/design/example.md'],'scope':['docs/design/example.md'],'checks':[[sys.executable,'-c','assert True']]}))

root = Path.cwd()
change = root / 'openspec/changes/isolated-check'
authority = root / 'docs/design/example.md'
original = authority.read_bytes()

def call(action, ok=True):
    result = subprocess.run([sys.executable, str(adapter), action, 'isolated-check'], capture_output=True, text=True)
    assert (result.returncode == 0) == ok, result.stdout + result.stderr
    print(action, 'PASS' if ok else 'EXPECTED BLOCK', flush=True)
    return result

call('verify')
original_config = (change / 'workflow.json').read_text()
bad = json.loads(original_config)
bad['authority'] = ['docs/design/../../openspec/config.yaml']
(change / 'workflow.json').write_text(json.dumps(bad))
call('verify', False)
assert not (change / '.workflow-evidence.json').exists()
(change / 'workflow.json').write_text(original_config)
call('verify')
call('archive', False) # unfinished tasks
(change / 'tasks.md').write_text('# Tasks\n- [ ] 1.1 Reopened implementation after design adjustment\n- [ ] 1.2 Verify out-of-order completion\n- [ ] 1.3 Verify disposal\n')
r = call('resume')
assert '"remaining": 3' in r.stdout
call('archive', False) # stale task evidence
call('invalidate')
assert not (change / '.workflow-evidence.json').exists()
config = json.loads((change / 'workflow.json').read_text())
config['checks'] = [[sys.executable, '-c', 'raise SystemExit(1)']]
(change / 'workflow.json').write_text(json.dumps(config))
call('verify', False)
assert not (change / '.workflow-evidence.json').exists()
config['checks'] = [[sys.executable, '-c', "from pathlib import Path; Path('docs/design/example.md').write_text('mutated')"]]
(change / 'workflow.json').write_text(json.dumps(config))
call('verify', False)
assert not (change / '.workflow-evidence.json').exists()
authority.write_bytes(original)
config['checks'] = [[sys.executable, '-c', 'assert True']]
(change / 'workflow.json').write_text(json.dumps(config))
(change / 'tasks.md').write_text('# Tasks\n- [x] 1.1 Verify identity\n- [x] 1.2 Verify out-of-order\n- [x] 1.3 Verify disposal\n')
call('verify')
# Actual archive gate must reject execution changes even when omitted from scope.
for name in ['openspec/config.yaml', 'openspec/schemas/form-change/schema.yaml',
             'openspec/schemas/form-change/templates/tasks.md', 'tools/engineering/workflow.py']:
    execution_file = root / name
    saved = execution_file.read_bytes()
    execution_file.write_bytes(saved + b'\n# changed execution input\n')
    result = call('archive', False)
    assert 'Stale evidence' in result.stderr, result.stderr
    execution_file.write_bytes(saved)
linked = root / 'docs/design/linked'
linked.symlink_to(root / 'tools', target_is_directory=True)
saved_config = (change / 'workflow.json').read_text()
linked_config = json.loads(saved_config)
linked_config['scope'] = ['docs/design']
(change / 'workflow.json').write_text(json.dumps(linked_config))
result = call('verify', False)
assert 'Symlink' in result.stderr, result.stderr
assert not (change / '.workflow-evidence.json').exists()
linked.unlink()
(change / 'workflow.json').write_text(saved_config)
call('verify')
authority.write_bytes(original + b'\nNew confirmed requirement.\n')
call('archive', False) # stale authority
# Change retained on failure; reverify then archive without spec sync.
assert change.is_dir()
authority.write_bytes(original)
call('verify')
call('archive')
assert not change.exists()
assert list((root / 'openspec/changes/archive').glob('*-isolated-check'))
assert authority.read_bytes() == original
assert not list((root / 'openspec/specs').glob('**/*.md'))
call('archive', False) # retry cannot create a second archive
print('All isolated scenarios passed; authority SHA256', hashlib.sha256(original).hexdigest())
