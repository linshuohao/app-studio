exports.up = (pgm) =>
  pgm.sql(`
ALTER TABLE platform_creation_sessions
  ADD COLUMN draft_name text,
  ADD COLUMN draft_version_name text,
  ADD COLUMN draft_text text,
  ADD COLUMN draft_applied integer,
  ADD COLUMN draft_checkpoint integer NOT NULL DEFAULT 0,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX platform_agent_drafts ON platform_creation_sessions(space_id,user_id,updated_at DESC) WHERE form_id IS NULL;
`);
