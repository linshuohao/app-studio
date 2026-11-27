import { NotFoundException } from '@nestjs/common';
import type { QueryExecutor } from './database.js';
import { readDiagnosticAssets, type DiagnosticAsset } from './diagnostic-assets.js';
import { resourceId } from './form-drafts.js';

type DiagnosticReference = {
  kind: 'diagnostic';
  diagnosticId: string;
  formId: string;
  versionId: string;
  releaseId: string;
  name: string;
  errorCode: string;
  phase: string;
  targetId: string | null;
  evidenceStatus: string;
  assetCandidates?: DiagnosticAsset[];
};

// Both reference queries use the index only, including when original evidence expires.
const referenceFields = `'diagnostic' AS kind, e.id AS "diagnosticId", f.form_id AS "formId",
      r.version_id AS "versionId", e.release_id AS "releaseId", f.name AS name,
      e.error_code AS "errorCode", e.phase, e.target_id AS "targetId",
      CASE WHEN e.evidence_status='captured' AND e.received_at < now() - interval '7 days'
        THEN 'expired' ELSE e.evidence_status END AS "evidenceStatus"`;
const visibleEvents = `
    FROM platform_diagnostic_events e JOIN platform_releases r USING(release_id)
    JOIN platform_forms f USING(form_id)
    WHERE f.space_id=$1 AND e.received_at >= now() - interval '30 days'`;

export async function readDiagnosticReference(
  db: QueryExecutor,
  spaceId: string,
  id: string,
  includeAssetCandidates = false,
) {
  const row = await db.one<DiagnosticReference>(
    `SELECT ${referenceFields} ${visibleEvents} AND e.id=$2`,
    [spaceId, resourceId(id)],
  );
  if (!row) throw new NotFoundException('引用的错误记录已不可用。');
  if (!includeAssetCandidates) return row;
  const assetCandidates = await readDiagnosticAssets(db, row);
  return assetCandidates.length ? { ...row, assetCandidates } : row;
}

export async function listDiagnosticReferences(
  db: QueryExecutor,
  spaceId: string,
  search: string,
  limit: number,
  offset: number,
) {
  return db.one<{ items: Array<DiagnosticReference & { occurredAt: string }>; total: number }>(
    `WITH matches AS (
       SELECT ${referenceFields}, e.occurred_at AS "occurredAt", e.received_at AS "receivedAt"
       ${visibleEvents}
       AND ($2 = '' OR strpos(lower(concat_ws(' ', f.name, e.error_code, e.target_id, e.id)), lower($2)) > 0)
     ), page AS (
       SELECT * FROM matches ORDER BY "receivedAt" DESC, "diagnosticId" DESC LIMIT $3 OFFSET $4
     )
     SELECT (SELECT count(*)::integer FROM matches) AS total,
       coalesce((SELECT json_agg(page ORDER BY "receivedAt" DESC, "diagnosticId" DESC) FROM page), '[]') AS items`,
    [spaceId, search, limit, offset],
  );
}
