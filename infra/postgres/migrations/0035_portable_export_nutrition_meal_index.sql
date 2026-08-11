CREATE INDEX nutrition_meals_user_export_idx
  ON nutrition_meals (user_id, occurred_at, created_at, id);
