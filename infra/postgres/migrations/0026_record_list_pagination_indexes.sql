DROP INDEX IF EXISTS health_records_user_occurred_idx;
CREATE INDEX health_records_user_occurred_idx
  ON health_records (user_id, occurred_at DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS workout_sessions_user_started_idx;
CREATE INDEX workout_sessions_user_started_idx
  ON workout_sessions (user_id, started_at DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS nutrition_meals_user_occurred_idx;
CREATE INDEX nutrition_meals_user_occurred_idx
  ON nutrition_meals (user_id, occurred_at DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
