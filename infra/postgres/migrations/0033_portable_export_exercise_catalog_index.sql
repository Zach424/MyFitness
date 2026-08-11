CREATE INDEX user_exercise_catalog_entries_user_export_idx
  ON user_exercise_catalog_entries (user_id, created_at, id);
