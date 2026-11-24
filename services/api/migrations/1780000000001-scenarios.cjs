exports.up = (pgm) =>
  pgm.sql(`CREATE TABLE platform_scenarios (
  space_id TEXT NOT NULL REFERENCES platform_spaces,
  id UUID NOT NULL, revision INTEGER NOT NULL, definition JSONB NOT NULL,
  PRIMARY KEY (space_id, id)
)`);
