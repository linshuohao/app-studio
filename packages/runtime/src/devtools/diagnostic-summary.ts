import type { Diagnostic, RuntimeDiagnosticReport } from '../types.js';
/** 轨迹默认只传执行元数据；异常完整现场继续走原 Host 出口，不广播整份 Data / Context。 */
function entry({ evidence: _evidence, ...metadata }: Diagnostic) {
  return metadata;
}
export function diagnosticSummary(report: RuntimeDiagnosticReport): unknown {
  return report.kind === 'flush'
    ? { ...report, entries: report.entries.map(entry) }
    : { kind: report.kind, entry: entry(report.entry) };
}
