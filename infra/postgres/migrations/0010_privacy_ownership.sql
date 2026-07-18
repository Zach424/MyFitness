ALTER TABLE consent_events
  DROP CONSTRAINT consent_events_user_id_purpose_version_key;

ALTER TABLE consent_events
  ADD CONSTRAINT consent_events_revocation_after_acceptance_check
  CHECK (revoked_at IS NULL OR revoked_at >= accepted_at);

CREATE INDEX consent_events_user_purpose_lifecycle_idx
  ON consent_events (user_id, purpose, accepted_at DESC);

ALTER TABLE nutrition_photo_candidates
  DROP CONSTRAINT nutrition_photo_candidates_storage_key_check;

ALTER TABLE nutrition_photo_candidates
  ADD CONSTRAINT nutrition_photo_candidates_storage_key_check
  CHECK (
    storage_key IS NULL
    OR storage_key ~ '^[0-9a-f-]{36}\.jpg$'
    OR storage_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  );
