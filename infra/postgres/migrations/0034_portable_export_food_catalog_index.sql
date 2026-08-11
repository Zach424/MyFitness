CREATE INDEX user_food_catalog_entries_user_export_idx
  ON user_food_catalog_entries (user_id, created_at, id);
