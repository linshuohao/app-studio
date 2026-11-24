exports.up = (pgm) =>
  pgm.sql(`
CREATE TABLE platform_creation_sessions (
 id text PRIMARY KEY, space_id text NOT NULL REFERENCES platform_spaces,
 user_id text NOT NULL REFERENCES platform_users, document text NOT NULL,
 turns jsonb NOT NULL DEFAULT '[]', revision integer NOT NULL DEFAULT 0,
 preview_digest text, form_id text REFERENCES platform_forms, version_id text, FOREIGN KEY (form_id,version_id) REFERENCES platform_versions(form_id,version_id)
);
`);
