exports.up = (pgm) =>
  pgm.sql(`
  ALTER TABLE platform_versions ADD COLUMN web_asset_bindings jsonb;
  ALTER TABLE platform_form_drafts ADD COLUMN preview_web_bindings jsonb;
  CREATE TABLE platform_agent_asset_environments (
    id text PRIMARY KEY,
    baseline text NOT NULL,
    web_asset_bindings jsonb NOT NULL
  );
`);

exports.down = (pgm) =>
  pgm.sql(`
  DROP TABLE platform_agent_asset_environments;
  ALTER TABLE platform_form_drafts DROP COLUMN preview_web_bindings;
  ALTER TABLE platform_versions DROP COLUMN web_asset_bindings;
`);
