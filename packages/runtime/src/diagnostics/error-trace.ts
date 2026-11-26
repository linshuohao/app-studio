import type { DiagnosticTrace, DiagnosticTraceStep } from '../types.js';

// Snapshot roots are immutable and shared. Keep only a finite window of step references.
const maximumSteps = 200;

export class ErrorTrace {
  private readonly steps = new Map<number, DiagnosticTraceStep>();

  record(step: DiagnosticTraceStep): void {
    this.steps.set(step.sequence, Object.freeze(step));
    if (this.steps.size > maximumSteps) this.steps.delete(this.steps.keys().next().value!);
  }

  through(failure: DiagnosticTraceStep): DiagnosticTrace {
    const selected = new Map<number, DiagnosticTraceStep>();
    const gaps = new Set<DiagnosticTrace['gaps'][number]>();
    const candidates = [...this.steps.values()];
    const pending = [failure];
    const visitedExecutions = new Set<number>();
    let hasTrigger = false;

    while (pending.length) {
      const step = pending.pop()!;
      if (selected.has(step.sequence)) continue;
      selected.set(step.sequence, step);
      hasTrigger ||= step.kind === 'execution.trigger' || step.kind === 'data.change';
      for (const ref of [step.origin, ...(step.triggeredBy ?? [])]) {
        if (!ref) continue;
        const cause = this.steps.get(ref.sequence);
        if (cause) pending.push(cause);
        else gaps.add('missing_step');
      }

      const execution = step.execution;
      if (!execution || visitedExecutions.has(execution.id)) continue;
      visitedExecutions.add(execution.id);
      const parent =
        execution.parentId === undefined
          ? undefined
          : candidates.find((candidate) => candidate.execution?.id === execution.parentId)
              ?.execution;
      if (execution.parentId !== undefined && !parent) gaps.add('missing_step');
      for (const candidate of candidates) {
        const related = candidate.execution;
        if (!related) continue;
        if (related.id === execution.id || related.id === parent?.id) pending.push(candidate);
        // Earlier children of the same rule are actions or prerequisites in this invocation.
        if (
          parent &&
          (parent.kind === 'reaction' || parent.kind === 'constraint') &&
          related.parentId === parent.id
        ) {
          pending.push(candidate);
        }
        if (
          (execution.kind === 'reaction' || execution.kind === 'constraint') &&
          related.parentId === execution.id
        ) {
          pending.push(candidate);
        }
      }
    }
    if (!hasTrigger) gaps.add('missing_trigger');
    return Object.freeze({
      version: 1,
      status: gaps.size ? 'partial' : 'complete',
      gaps: Object.freeze([...gaps]),
      steps: Object.freeze(
        [...selected.values()].sort((left, right) => left.sequence - right.sequence),
      ),
    });
  }
}
