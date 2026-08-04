ALTER TABLE consent_events
  DROP CONSTRAINT consent_events_purpose_check;

ALTER TABLE consent_events
  ADD CONSTRAINT consent_events_purpose_check
  CHECK (purpose IN (
    'terms', 'privacy', 'health_data', 'ai_plan_explanation', 'food_photo_analysis',
    'progress_photo_analysis', 'progress_photo_retention'
  ));

ALTER TABLE nutrition_photo_candidates
  DROP CONSTRAINT nutrition_photo_candidates_storage_key_check;

ALTER TABLE nutrition_photo_candidates
  ADD CONSTRAINT nutrition_photo_candidates_storage_key_check
  CHECK (
    storage_key IS NULL
    OR storage_key ~ '^[0-9a-f-]{36}\.jpg$'
    OR storage_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    OR storage_key ~ '^[0-9a-f-]{36}/food/[0-9a-f-]{36}\.jpg$'
  );

CREATE TABLE progress_photos (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'ready', 'deleted', 'expired')),
  view TEXT NOT NULL CHECK (view IN ('front', 'side', 'back')),
  retention_mode TEXT NOT NULL CHECK (retention_mode IN ('analysis_only', 'retained')),
  captured_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 64),
  storage_key TEXT CHECK (
    storage_key IS NULL
    OR storage_key ~ '^[0-9a-f-]{36}/progress/[0-9a-f-]{36}\.jpg$'
  ),
  content_type TEXT CHECK (content_type IS NULL OR content_type = 'image/jpeg'),
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size BETWEEN 1 AND 6291456),
  width INTEGER CHECK (width IS NULL OR width BETWEEN 1 AND 1600),
  height INTEGER CHECK (height IS NULL OR height BETWEEN 1 AND 1600),
  media_sha256 CHAR(64),
  quality_method_version TEXT NOT NULL CHECK (
    quality_method_version = 'progress-photo-capture-quality-2026-08-04.v1'
  ),
  quality JSONB CHECK (quality IS NULL OR jsonb_typeof(quality) = 'object'),
  analysis_consent_event_id UUID NOT NULL REFERENCES consent_events(id),
  retention_consent_event_id UUID REFERENCES consent_events(id),
  input_fingerprint CHAR(64) NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  upload_expires_at TIMESTAMPTZ NOT NULL,
  retention_expires_at TIMESTAMPTZ,
  media_deletion_status TEXT NOT NULL DEFAULT 'not_required' CHECK (
    media_deletion_status IN ('not_required', 'pending', 'deleted')
  ),
  analysis_revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  UNIQUE (user_id, idempotency_key),
  CHECK (
    (retention_mode = 'analysis_only'
      AND retention_consent_event_id IS NULL
      AND retention_expires_at IS NOT NULL)
    OR
    (retention_mode = 'retained'
      AND retention_consent_event_id IS NOT NULL
      AND retention_expires_at IS NULL)
  ),
  CHECK (
    (status = 'reserved'
      AND storage_key IS NULL AND quality IS NULL AND completed_at IS NULL
      AND deleted_at IS NULL AND media_deletion_status = 'not_required')
    OR
    (status = 'ready'
      AND storage_key IS NOT NULL AND completed_at IS NOT NULL AND deleted_at IS NULL
      AND media_deletion_status = 'not_required'
      AND (quality IS NOT NULL OR analysis_revoked_at IS NOT NULL))
    OR
    (status IN ('deleted', 'expired')
      AND storage_key IS NULL AND quality IS NULL AND deleted_at IS NOT NULL
      AND media_deletion_status IN ('pending', 'deleted'))
  )
);

CREATE INDEX progress_photos_user_ready_idx
  ON progress_photos (user_id, captured_at DESC)
  WHERE status = 'ready';

CREATE INDEX progress_photos_expiry_idx
  ON progress_photos (retention_expires_at)
  WHERE status = 'ready' AND retention_expires_at IS NOT NULL;

CREATE INDEX progress_photos_upload_expiry_idx
  ON progress_photos (upload_expires_at)
  WHERE status = 'reserved';
