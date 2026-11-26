exports.up = (pgm) =>
  pgm.sql(`
  CREATE TABLE platform_diagnostic_events (
    id uuid PRIMARY KEY,
    host_id text NOT NULL,
    event_id uuid NOT NULL,
    release_id text NOT NULL REFERENCES platform_releases,
    occurred_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    source text NOT NULL,
    phase text NOT NULL,
    error_code text NOT NULL,
    target_id text,
    fingerprint text NOT NULL,
    request_digest text NOT NULL,
    evidence_status text NOT NULL,
    UNIQUE (host_id, event_id)
  );
  CREATE INDEX platform_diagnostics_release_timeline
    ON platform_diagnostic_events (release_id, received_at DESC, id DESC);
  CREATE INDEX platform_diagnostics_retention ON platform_diagnostic_events (received_at);
  CREATE INDEX platform_diagnostics_host_intake
    ON platform_diagnostic_events (host_id, received_at);
  CREATE TABLE platform_diagnostic_evidence (
    event_id uuid PRIMARY KEY REFERENCES platform_diagnostic_events(id) ON DELETE CASCADE,
    evidence json NOT NULL
  );
  CREATE TABLE platform_diagnostic_reads (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES platform_diagnostic_events(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES platform_users,
    read_at timestamptz NOT NULL DEFAULT now()
  );
`);

exports.down = (pgm) =>
  pgm.sql(
    'DROP TABLE platform_diagnostic_reads, platform_diagnostic_evidence, platform_diagnostic_events',
  );
