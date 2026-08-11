CREATE INDEX workout_sessions_user_export_idx
  ON workout_sessions (user_id, started_at, created_at, id);
