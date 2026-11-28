import type { createRuntime, Diagnostic, RuntimeOptions } from '@form-engine/runtime';
import {
  diagnosticForms,
  diagnosticHost,
  matchesDiagnosticSample,
  ref,
} from '../../../../../services/api/test/fixtures/diagnostic-corpus';

const historicalSamples = new Map([
  ['sha256:3411a61d03836b3cecee5ed7a412ca5298e716b71f1b34e2ab5cbf83c4f47adf', 'warehouse'],
  ['sha256:b61251c828a07409a6877cbea009b0f6360cf9499376749c6b7d348937bd5237', 'supplier'],
  ['sha256:1cedd94061a68daf8c74f45ad78fbed1a9929cabda958ed53c67a352b1d7dc68', 'identity'],
  ['sha256:648872cfdbcf9fc19d90aceaa106c58b1977a19ceaf322c86b979d7f265aa128', 'invoice'],
  ['sha256:3f46bf189feab89ddc4d6b646d42b5336d1f3956053b7da9ebd53b8742f53a57', 'membership'],
  ['sha256:33ec26d3ec40b57931ef0d7ee78effa8a768d2e00394de080a1117b5f26d9cee', 'settlement'],
]);

export function localDiagnosticSample(preparedDigest: string) {
  const key = historicalSamples.get(preparedDigest);
  const form = diagnosticForms.find((candidate) => candidate.key === key);
  if (!form) return undefined;

  const createHost = (writeResult: (value: number) => void) => diagnosticHost(form, writeResult);

  return {
    cases: form.cases.map(({ id, label }) => ({ id, label })),
    createHost,
    async reproduce(
      id: string,
      create: typeof createRuntime,
      input: Pick<RuntimeOptions, 'prepared' | 'functions'>,
    ) {
      const sample = form.cases.find((candidate) => candidate.id === id);
      if (!sample) throw new Error('找不到本地诊断用例。');
      const diagnostics: Diagnostic[] = [];
      const runtime: ReturnType<typeof createRuntime> = create({
        ...input,
        traceCapacity: 0,
        maxExecutions: 4,
        data: { scenario: sample.id, record: '', amount: 10, result: 0, ...sample.input },
        host: createHost((value) => {
          runtime.dispatch({ op: 'set', target: ref('/result'), value });
        }),
        onDiagnostic: (report) => {
          if (report.kind === 'runtime') diagnostics.push(report.entry);
        },
      });
      try {
        runtime.dispatch({ op: 'set', target: ref('/record'), value: 'LOCAL-DIAGNOSTIC' });
        await runtime.flush();
        if (sample.kind === 'validator') await runtime.validate();
        const observed = diagnostics.some((entry) => matchesDiagnosticSample(entry, sample));
        return observed ? `已复现：${sample.label}（${sample.code}）` : `未复现：${sample.label}`;
      } finally {
        runtime.dispose();
      }
    },
  };
}

export type LocalDiagnosticSample = NonNullable<ReturnType<typeof localDiagnosticSample>>;
