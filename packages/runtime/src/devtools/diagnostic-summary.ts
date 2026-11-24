import type { Diagnostic, RuntimeDiagnosticReport } from '../types.js';
/** 轨迹默认只传执行元数据；异常完整现场继续走原 Host 出口，不广播整份 Data / Context。 */
function entry(diagnostic: Diagnostic) {
  // message 可以包含命令值、业务错误文本；默认广播只使用明确列出的元数据。
  const { sequence, kind, ruleId, round, origin, execution, relatedCalls } = diagnostic;
  return {
    sequence,
    kind,
    ...(ruleId === undefined ? {} : { ruleId }),
    ...(round === undefined ? {} : { round }),
    ...(origin ? { origin } : {}),
    ...(execution ? { execution } : {}),
    ...(relatedCalls ? { relatedCalls } : {}),
  };
}
export function diagnosticSummary(report: RuntimeDiagnosticReport): unknown {
  return report.kind === 'flush'
    ? { ...report, entries: report.entries.map(entry) }
    : { kind: report.kind, entry: entry(report.entry) };
}
