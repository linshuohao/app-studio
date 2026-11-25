exports.up = (pgm) =>
  pgm.sql(`
    ALTER TABLE platform_form_drafts
      ADD COLUMN draft_issues jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN applied_draft_issues jsonb NOT NULL DEFAULT '[]'
  `);

exports.down = (pgm) =>
  pgm.sql(`
    ALTER TABLE platform_form_drafts DROP COLUMN draft_issues, DROP COLUMN applied_draft_issues
  `);
