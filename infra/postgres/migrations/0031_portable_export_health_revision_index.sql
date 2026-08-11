CREATE INDEX health_record_revisions_user_export_idx
  ON health_record_revisions (user_id, changed_at, revision, id);
