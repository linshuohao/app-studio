import type { DiagnosticEvidence, RuntimeDiagnosticReport } from '@form-engine/runtime';
import type { RendererDiagnostic } from '@form-engine/renderer-react';

const api = '/api/platform/diagnostics/pilot';
const lifetime = 24 * 60 * 60 * 1000;
const maxEvidenceBytes = 512 * 1024;
const maxQueueBytes = 8 * 1024 * 1024;

type DiagnosticTargetKind = 'reaction' | 'constraint' | 'material_node';
const runtimeEvents: Readonly<
  Record<string, { phases: readonly string[]; targetKind: DiagnosticTargetKind }>
> = {
  'reaction.error': { phases: ['when', 'execute'], targetKind: 'reaction' },
  'reaction.action.error': { phases: ['action', 'payload', 'invoke'], targetKind: 'reaction' },
  'validation.error': { phases: ['when', 'requires', 'assert'], targetKind: 'constraint' },
  'validator.error': { phases: ['invoke', 'result'], targetKind: 'constraint' },
};

type Packet = {
  schemaVersion: 1;
  eventId: string;
  releaseId: string;
  occurredAt: string;
  source: 'runtime' | 'renderer';
  phase: string;
  errorCode: string;
  targetId?: string;
  targetKind?: DiagnosticTargetKind;
};

type Queued = { id: string; owner: string; expires: number; body: string; bytes: number };

let database: Promise<IDBDatabase> | undefined;
let draining = false;
let needsDrain = false;
let scheduled: number | undefined;
let retry = 1000;

function openQueue() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open('studio-form-diagnostics', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('events', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}

async function withQueue<T>(operate: (store: IDBObjectStore, report: (value: T) => void) => void) {
  const db = await openQueue();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction('events', 'readwrite');
    let value: T;
    transaction.oncomplete = () => resolve(value);
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
    operate(transaction.objectStore('events'), (result) => {
      value = result;
    });
  });
}

function scan(store: IDBObjectStore, inspect: (rows: Queued[]) => void) {
  const request = store.getAll();
  request.onsuccess = () => {
    const now = Date.now();
    const rows: Queued[] = [];
    for (const row of request.result as Queued[]) {
      if (row.expires <= now) store.delete(row.id);
      else rows.push(row);
    }
    inspect(rows);
  };
}

async function currentOwner() {
  const response = await fetch(api, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (response.status === 429 || response.status >= 500)
    throw new Error('Retry diagnostic identity');
  if (!response.ok) return undefined;
  const body: { owner?: unknown } = await response.json();
  return typeof body.owner === 'string' ? body.owner : undefined;
}

function schedule(delay: number) {
  if (scheduled !== undefined) window.clearTimeout(scheduled);
  scheduled = window.setTimeout(() => {
    scheduled = undefined;
    void drain();
  }, delay);
}

function queuedBody(body: string) {
  const event = JSON.parse(body) as Packet;
  if (!event.targetId || event.targetKind) return body;
  const targetKind =
    event.errorCode === 'MATERIAL_UNAVAILABLE'
      ? 'material_node'
      : runtimeEvents[event.errorCode]?.targetKind;
  return targetKind ? JSON.stringify({ ...event, targetKind }) : body;
}

async function drain() {
  if (draining) {
    needsDrain = true;
    return;
  }
  draining = true;
  try {
    const rows = await withQueue<Queued[]>((store, report) => scan(store, report));
    if (!rows.length) return;
    const owner = await currentOwner();
    if (!owner) return;
    for (const row of rows.filter((item) => item.owner === owner)) {
      if (row.expires > Date.now()) {
        const response = await fetch(api + '/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Diagnostic-Owner': owner },
          body: queuedBody(row.body),
          signal: AbortSignal.timeout(10000),
        });
        if (response.status === 401 || response.status === 403) return;
        if (response.status === 429 || response.status >= 500)
          throw new Error('Retry diagnostic upload');
        if (!response.ok) console.warn('Form diagnostic upload rejected');
      }
      await withQueue<void>((store) => {
        store.delete(row.id);
      });
    }
    retry = 1000;
  } catch {
    schedule(retry);
    retry = Math.min(retry * 2, 60_000);
  } finally {
    draining = false;
    if (needsDrain) {
      needsDrain = false;
      if (scheduled === undefined) schedule(0);
    }
  }
}

let started = false;
export function resumeDiagnosticUploads() {
  if (!started) {
    started = true;
    window.addEventListener('online', () => schedule(0));
  }
  schedule(0);
}

export function createDiagnosticUpload(releaseId: string, owner: string) {
  function enqueue(
    fields: Omit<Packet, 'schemaVersion' | 'eventId' | 'releaseId' | 'occurredAt'>,
    evidence: DiagnosticEvidence | RendererDiagnostic,
  ) {
    const packet: Packet = {
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      releaseId,
      occurredAt: new Date().toISOString(),
      ...fields,
    };
    window.setTimeout(() => {
      void persist(packet, evidence).catch(() => console.warn('Form diagnostic queue unavailable'));
    }, 0);
  }

  async function persist(packet: Packet, evidence: DiagnosticEvidence | RendererDiagnostic) {
    let proof: string | undefined;
    let evidenceStatus = 'missing';
    if (evidence !== undefined) {
      try {
        proof = JSON.stringify(evidence);
        if (proof !== undefined) {
          if (
            new TextEncoder().encode(proof).length > maxEvidenceBytes &&
            'trace' in evidence &&
            evidence.trace
          ) {
            proof = JSON.stringify({
              ...evidence,
              trace: { version: 1, status: 'partial', gaps: ['size_limit'], steps: [] },
            });
          }
          if (new TextEncoder().encode(proof).length > maxEvidenceBytes) {
            evidenceStatus = 'too_large';
            proof = undefined;
          } else evidenceStatus = 'captured';
        }
      } catch {
        evidenceStatus = 'serialization_failed';
      }
    }
    const envelope = JSON.stringify({ ...packet, evidenceStatus });
    const body =
      proof === undefined ? envelope : envelope.slice(0, -1) + ',"evidence":' + proof + '}';
    const bytes = new TextEncoder().encode(body).length;
    const accepted = await withQueue<boolean>((store, report) =>
      scan(store, (rows) => {
        if (
          rows.length >= 100 ||
          rows.reduce((total, row) => total + row.bytes, 0) + bytes > maxQueueBytes
        ) {
          report(false);
          return;
        }
        store.add({
          id: packet.eventId,
          owner,
          body,
          bytes,
          expires: Date.parse(packet.occurredAt) + lifetime,
        });
        report(true);
      }),
    );
    if (accepted) schedule(0);
    else console.warn('Form diagnostic queue is full');
  }

  return {
    runtime(report: RuntimeDiagnosticReport) {
      // Every Runtime entry with evidence is emitted independently. The same
      // entry in a Flush report is a mirror, so it receives no new identity.
      if (report.kind !== 'runtime' || !report.entry.evidence) return;
      const { kind, ruleId, evidence } = report.entry;
      if (kind === 'flush.aborted') {
        enqueue({ source: 'runtime', errorCode: kind, phase: 'flush' }, evidence);
        return;
      }
      const mapping = runtimeEvents[kind];
      const phase =
        kind === 'reaction.error' && evidence.phase === kind ? 'execute' : evidence.phase;
      if (mapping?.phases.includes(phase))
        enqueue(
          {
            source: 'runtime',
            errorCode: kind,
            phase,
            targetId: ruleId,
            targetKind: ruleId ? mapping.targetKind : undefined,
          },
          evidence,
        );
    },
    renderer(entry: RendererDiagnostic) {
      if (entry.code === 'MATERIAL_UNAVAILABLE' && entry.phase === 'render')
        enqueue(
          {
            source: 'renderer',
            errorCode: entry.code,
            phase: entry.phase,
            targetId: entry.nodeId,
            targetKind: entry.nodeId ? 'material_node' : undefined,
          },
          entry,
        );
    },
  };
}
