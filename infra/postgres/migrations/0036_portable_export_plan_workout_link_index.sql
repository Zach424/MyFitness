CREATE INDEX plan_workout_links_user_plan_export_idx
  ON plan_workout_links (user_id, plan_id, linked_at, id);
