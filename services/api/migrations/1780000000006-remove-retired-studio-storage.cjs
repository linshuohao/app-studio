exports.up = (pgm) =>
  pgm.sql(`
DROP TABLE platform_scenarios;
ALTER TABLE platform_form_drafts
  DROP COLUMN candidate_check_id,
  DROP COLUMN candidate_environment;
ALTER TABLE platform_draft_deliveries DROP COLUMN source_revision;
`);

exports.down = () => {
  throw new Error('Retired Studio storage requires a backup to restore dropped data');
};
