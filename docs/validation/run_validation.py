"""One reproducible entry point. Uses only local inputs after installing requirements."""
from pathlib import Path
import subprocess,sys,json,zipfile,hashlib,platform
from importlib.metadata import version
P=Path(__file__).resolve().parent
for script in ['extend_cases.py','validator/create_schema.py','validator/validate_cases.py','validator/behavior_smoke.py','validator/extended_smoke.py','build_coverage.py']:
 subprocess.run([sys.executable,str(P/script)],cwd=P,check=True)
source=json.loads((P/'source-manifest.json').read_text());archive=P.parent/'history/l1-protocol-validation-source.zip'
with zipfile.ZipFile(archive) as z:
 for name,digest in source['files'].items():assert hashlib.sha256(z.read('l1_protocol_validation/'+name)).hexdigest()==digest,name
 for folder in ['cases','fixtures']:
  for f in (P/folder).glob('0[1-5]-*.json'):
   expected=json.loads(z.read('l1_protocol_validation/'+folder+'/'+f.name))
   if folder=='cases':
    expected['views']={name:profile['entry'] for name,profile in expected['views'].items()}
    for constraint in expected.get('constraints',[]):
     if constraint['kind']=='external':constraint['watch']=constraint.pop('dependsOn')
   assert json.loads(f.read_text())==expected,f
report=json.loads((P/'report.json').read_text());report['provenance']={'sourceArchive':'../history/l1-protocol-validation-source.zip','sourceArchiveFilesVerified':len(source['files']),'originalSourceArchiveUnchanged':True,'originalFixturesUnchanged':True,'originalCasesOnlyChange':'views.<profile>.entry flattened to views.<profile>; external constraints dependsOn renamed to watch without changing references','python':platform.python_version(),'jsonschema':version('jsonschema'),'definitionSource':'../design/l1/07-examples.md#sample'}
(P/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
subprocess.run([sys.executable,str(P/'create_report.py')],cwd=P,check=True)
print('All local checks complete; atlas rebuilt. Production Runtime/Renderer is not tested.')
