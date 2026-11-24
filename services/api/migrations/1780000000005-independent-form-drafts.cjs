exports.up = (pgm) =>
  pgm.sql(`
LOCK TABLE platform_creation_sessions IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF EXISTS (SELECT FROM platform_creation_sessions) THEN
    IF to_regclass('pg_temp.agent_conversation_cutover') IS NULL THEN
      RAISE EXCEPTION 'Import and verify every Agent conversation before cutting over Platform';
    END IF;
    IF EXISTS (
      SELECT FROM platform_creation_sessions s FULL JOIN pg_temp.agent_conversation_cutover proof ON proof.id=s.id
      WHERE s.id IS NULL OR proof.id IS NULL OR proof.row_digest IS DISTINCT FROM md5(to_jsonb(s)::text)
    ) THEN RAISE EXCEPTION 'Conversation transfer proof is incomplete or out of date'; END IF;
  END IF;
END $guard$;

CREATE TABLE platform_form_drafts (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES platform_users, space_id text NOT NULL REFERENCES platform_spaces,
 name text NOT NULL, version_name text NOT NULL, working_text text NOT NULL,
 candidate_text text NOT NULL, candidate_base_text text, candidate_digest text NOT NULL,
 candidate_check_id text, candidate_environment text, applied_digest text NOT NULL, revision integer NOT NULL CHECK(revision>=1),
 source_revision integer NOT NULL CHECK(source_revision>=1), preview_digest text,
 form_id text REFERENCES platform_forms, version_id text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(form_id,version_id) REFERENCES platform_versions(form_id,version_id),
 CHECK((form_id IS NULL) = (version_id IS NULL))
);
CREATE INDEX platform_form_drafts_by_owner ON platform_form_drafts(space_id,user_id,updated_at DESC) WHERE form_id IS NULL;

-- Delivery receipts outlive discarded drafts, so replay cannot recreate a deleted resource.
CREATE TABLE platform_draft_deliveries (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES platform_users, space_id text NOT NULL REFERENCES platform_spaces,
 draft_id text NOT NULL, payload_digest text NOT NULL, source_revision integer NOT NULL
);
CREATE INDEX platform_draft_delivery_target ON platform_draft_deliveries(draft_id);

CREATE TEMP TABLE legacy_draft_source ON COMMIT DROP AS
SELECT s.*, latest.item AS candidate, latest.ordinal::integer AS candidate_ordinal,
       COALESCE(s.turns->(s.draft_applied-1)->'result'->>'candidate_text',first_candidate.text) AS applied_text
FROM platform_creation_sessions s
JOIN LATERAL (SELECT item,ordinal FROM jsonb_array_elements(s.turns) WITH ORDINALITY t(item,ordinal)
 WHERE item->'result'->>'kind'='proposal' ORDER BY ordinal DESC LIMIT 1) latest ON true
JOIN LATERAL (SELECT item->'result'->>'candidate_text' AS text FROM jsonb_array_elements(s.turns)
 WITH ORDINALITY t(item,ordinal) WHERE item->'result'->>'kind'='proposal' ORDER BY ordinal LIMIT 1) first_candidate ON true;

DO $drafts$
BEGIN
 IF EXISTS (SELECT FROM platform_creation_sessions s WHERE (s.form_id IS NOT NULL OR s.draft_text IS NOT NULL)
   AND NOT EXISTS(SELECT FROM legacy_draft_source p WHERE p.id=s.id)) THEN
   RAISE EXCEPTION 'Stored working or saved form lacks a source proposal';
 END IF;
 IF EXISTS (SELECT FROM legacy_draft_source s WHERE s.applied_text IS NULL OR
   (s.draft_applied IS NOT NULL AND (s.turns->(s.draft_applied-1)->'result'->>'kind') IS DISTINCT FROM 'proposal')
   OR s.candidate->'result'->'check'->>'success' IS DISTINCT FROM 'true'
   OR s.candidate->'result'->'check'->>'candidate_digest' IS DISTINCT FROM
      ('sha256:'||encode(sha256(convert_to(s.candidate->'result'->>'candidate_text','UTF8')),'hex'))) THEN
   RAISE EXCEPTION 'Legacy draft is missing a valid applied candidate or receipt';
 END IF;
END $drafts$;

INSERT INTO platform_form_drafts (id,user_id,space_id,name,version_name,working_text,
 candidate_text,candidate_base_text,candidate_digest,candidate_check_id,candidate_environment,applied_digest,
 revision,source_revision,preview_digest,form_id,version_id,updated_at)
SELECT s.id,s.user_id,s.space_id,coalesce(s.draft_name,'Agent 生成的表单 · '||left(s.id,8)),coalesce(s.draft_version_name,'Agent 初稿 V1'),
 coalesce(s.draft_text,s.applied_text),s.candidate->'result'->>'candidate_text',s.candidate->>'baseText',
 s.candidate->'result'->'check'->>'candidate_digest',s.candidate->'result'->'check'->>'check_id',s.candidate->>'checkEnvironment',
 'sha256:'||encode(sha256(convert_to(s.applied_text,'UTF8')),'hex'),greatest(s.draft_checkpoint,1),
 s.candidate_ordinal,s.preview_digest,s.form_id,s.version_id,s.updated_at FROM legacy_draft_source s;

DO $verify$
BEGIN
 IF EXISTS (SELECT FROM legacy_draft_source s LEFT JOIN platform_form_drafts d ON s.id=d.id WHERE
 d.id IS NULL OR d.working_text IS DISTINCT FROM coalesce(s.draft_text,s.applied_text)
 OR d.form_id IS DISTINCT FROM s.form_id OR d.version_id IS DISTINCT FROM s.version_id
 OR d.candidate_text IS DISTINCT FROM s.candidate->'result'->>'candidate_text') THEN
   RAISE EXCEPTION 'Draft transfer verification failed';
 END IF;
END $verify$;
-- The offline importer stages precisely the receipts Agent will return on replay.
-- New installations have an empty source and need no staged rows.
CREATE TEMP TABLE IF NOT EXISTS agent_draft_delivery_cutover (
 id text PRIMARY KEY,draft_id text NOT NULL,source_revision integer NOT NULL,payload_digest text NOT NULL
) ON COMMIT DROP;
DO $receipts$
BEGIN
 IF EXISTS (WITH expected AS (
   SELECT s.id AS draft_id,t.ordinal FROM platform_creation_sessions s CROSS JOIN LATERAL
   jsonb_array_elements(s.turns) WITH ORDINALITY t(item,ordinal) WHERE t.item->'result'->>'kind'='proposal'
 )
 SELECT FROM expected e FULL JOIN pg_temp.agent_draft_delivery_cutover p
   ON p.draft_id=e.draft_id AND p.source_revision=e.ordinal
 WHERE p.id IS NULL OR e.draft_id IS NULL OR p.payload_digest !~ '^sha256:[0-9a-f]{64}$') OR
 EXISTS (SELECT FROM pg_temp.agent_draft_delivery_cutover GROUP BY draft_id,source_revision HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'Historical proposal delivery proof is incomplete or ambiguous'; END IF;
END $receipts$;

INSERT INTO platform_draft_deliveries(id,user_id,space_id,draft_id,payload_digest,source_revision)
 SELECT p.id,d.user_id,d.space_id,d.id,p.payload_digest,p.source_revision
 FROM pg_temp.agent_draft_delivery_cutover p JOIN platform_form_drafts d ON p.draft_id=d.id;
-- Preserve only the existing, explicitly named runtime roles' DML grants.
DO $grants$
DECLARE permission record;
BEGIN
 FOR permission IN
   SELECT DISTINCT roles.rolname AS role_name, a.privilege_type AS privilege
   FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
   JOIN pg_roles roles ON roles.oid=a.grantee
   WHERE c.oid='platform_creation_sessions'::regclass AND a.grantee<>c.relowner
    AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
 LOOP
   EXECUTE format('GRANT %s ON TABLE platform_form_drafts,platform_draft_deliveries TO %I',
     permission.privilege,permission.role_name);
 END LOOP;
END $grants$;
DROP TABLE platform_creation_sessions;
`);
