ALTER TABLE nutrition_photo_candidates
  DROP CONSTRAINT nutrition_photo_candidates_storage_key_check;

ALTER TABLE nutrition_photo_candidates
  ADD CONSTRAINT nutrition_photo_candidates_storage_key_check
  CHECK (storage_key IS NULL OR storage_key ~ '^[0-9a-f-]{36}[.]jpg$');
