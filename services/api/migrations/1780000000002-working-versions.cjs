exports.up = (pgm) =>
  pgm.sql(`
CREATE TABLE platform_working_versions(
 work_id text PRIMARY KEY, form_id text NOT NULL REFERENCES platform_forms,
 name text NOT NULL, seed bytea NOT NULL, source_version_id text REFERENCES platform_versions(version_id),
 created_at text NOT NULL, UNIQUE(form_id,work_id)
);
INSERT INTO platform_working_versions(work_id,form_id,name,seed,created_at)
 SELECT version_id,form_id,coalesce(version_name,'配置 · '||left(saved_at,10)||' #'||sequence),''::bytea,saved_at FROM platform_versions;
ALTER TABLE platform_versions ADD COLUMN work_id text;
UPDATE platform_versions SET work_id=version_id;
CREATE FUNCTION assign_working_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.work_id IS NULL THEN
 NEW.work_id := NEW.version_id;
 INSERT INTO platform_working_versions(work_id,form_id,name,seed,created_at)
 VALUES(NEW.work_id,NEW.form_id,coalesce(NEW.version_name,'配置 · '||left(NEW.saved_at,10)||' #'||NEW.sequence),''::bytea,NEW.saved_at);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assign_work BEFORE INSERT ON platform_versions FOR EACH ROW EXECUTE FUNCTION assign_working_version();
ALTER TABLE platform_versions ALTER COLUMN work_id SET NOT NULL,
 ADD FOREIGN KEY(form_id,work_id) REFERENCES platform_working_versions(form_id,work_id);
CREATE INDEX platform_work_history ON platform_versions(work_id,sequence DESC);
`);
