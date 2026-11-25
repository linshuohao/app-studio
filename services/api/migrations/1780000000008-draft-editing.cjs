exports.up = (pgm) =>
  pgm.sql(`
    CREATE TABLE platform_draft_editing (
      draft_id text PRIMARY KEY REFERENCES platform_form_drafts(id) ON DELETE CASCADE,
      holder text NOT NULL CHECK (holder IN ('human', 'agent')),
      token uuid NOT NULL,
      recipient_id uuid NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE platform_draft_edit_notices (
      draft_id text NOT NULL REFERENCES platform_form_drafts(id) ON DELETE CASCADE,
      recipient_id uuid NOT NULL,
      blocked text NOT NULL CHECK (blocked IN ('human', 'agent')),
      blocked_at timestamptz NOT NULL,
      PRIMARY KEY (draft_id, recipient_id)
    );
  `);

exports.down = (pgm) => pgm.sql('DROP TABLE platform_draft_edit_notices, platform_draft_editing');
