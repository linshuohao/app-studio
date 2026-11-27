exports.up = (pgm) =>
  pgm.sql(`
    CREATE TABLE platform_asset_repair_tasks (
      id uuid PRIMARY KEY,
      space_id text NOT NULL REFERENCES platform_spaces,
      release_id text NOT NULL REFERENCES platform_releases,
      fingerprint text NOT NULL,
      asset_kind text NOT NULL CHECK (asset_kind IN ('material', 'function')),
      asset_id text NOT NULL,
      asset_lock jsonb NOT NULL,
      created_by text NOT NULL REFERENCES platform_users,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      revision integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'in_review', 'changes_requested', 'approved')),
      assignee text REFERENCES platform_users,
      pull_request jsonb,
      reviewer text REFERENCES platform_users,
      UNIQUE (space_id, release_id, fingerprint, asset_kind, asset_id)
    );
    CREATE INDEX platform_asset_repair_queue ON platform_asset_repair_tasks(space_id, updated_at DESC, id);
    CREATE TABLE platform_asset_repair_occurrences (
      task_id uuid NOT NULL REFERENCES platform_asset_repair_tasks ON DELETE CASCADE,
      diagnostic_id uuid NOT NULL,
      linked_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (task_id, diagnostic_id)
    );
    CREATE TABLE platform_asset_repair_actions (
      task_id uuid NOT NULL REFERENCES platform_asset_repair_tasks ON DELETE CASCADE,
      revision integer NOT NULL,
      actor_id text NOT NULL REFERENCES platform_users,
      request_key text NOT NULL,
      fingerprint text NOT NULL,
      action text NOT NULL,
      receipt jsonb NOT NULL,
      detail jsonb,

      recorded_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (task_id, revision),
      UNIQUE(task_id, actor_id, request_key)
    );
  `);

exports.down = (pgm) =>
  pgm.sql(
    'DROP TABLE platform_asset_repair_actions, platform_asset_repair_occurrences, platform_asset_repair_tasks',
  );
