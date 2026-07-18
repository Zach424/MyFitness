ALTER TABLE consent_events
  DROP CONSTRAINT consent_events_purpose_check;

ALTER TABLE consent_events
  ADD CONSTRAINT consent_events_purpose_check
  CHECK (purpose IN (
    'terms', 'privacy', 'health_data', 'ai_plan_explanation', 'food_photo_analysis'
  ));

CREATE TABLE nutrition_photo_candidates (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN (
    'reserved', 'processing', 'ready', 'failed', 'rejected', 'confirmed', 'deleted', 'expired'
  )),
  storage_key TEXT CHECK (
    storage_key IS NULL OR storage_key ~ '^[0-9a-f-]{36}\\.jpg$'
  ),
  content_type TEXT CHECK (content_type IS NULL OR content_type = 'image/jpeg'),
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size BETWEEN 1 AND 6291456),
  width INTEGER CHECK (width IS NULL OR width BETWEEN 1 AND 1600),
  height INTEGER CHECK (height IS NULL OR height BETWEEN 1 AND 1600),
  media_sha256 CHAR(64),
  prompt_version TEXT NOT NULL CHECK (prompt_version = 'food-photo-candidates-v1'),
  validator_version TEXT NOT NULL CHECK (validator_version = 'food-photo-catalog-safety-v1'),
  source TEXT CHECK (source IS NULL OR source IN ('model', 'fixture')),
  provider TEXT CHECK (provider IS NULL OR provider IN ('fixture', 'openai')),
  model TEXT CHECK (model IS NULL OR char_length(model) BETWEEN 1 AND 120),
  content JSONB CHECK (content IS NULL OR jsonb_typeof(content) = 'object'),
  selection JSONB CHECK (selection IS NULL OR jsonb_typeof(selection) = 'array'),
  failure_code TEXT CHECK (failure_code IS NULL OR failure_code IN (
    'provider_unavailable', 'provider_timeout', 'provider_refusal',
    'provider_error', 'invalid_output', 'safety_validation_failed'
  )),
  provider_response_id TEXT CHECK (
    provider_response_id IS NULL OR char_length(provider_response_id) BETWEEN 1 AND 200
  ),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  input_fingerprint CHAR(64) NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  consent_event_id UUID NOT NULL REFERENCES consent_events(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  UNIQUE (user_id, idempotency_key),
  CHECK (
    (status = 'reserved' AND storage_key IS NULL AND content IS NULL AND selection IS NULL
      AND source IS NULL AND provider IS NULL AND model IS NULL AND failure_code IS NULL
      AND completed_at IS NULL AND confirmed_at IS NULL AND deleted_at IS NULL)
    OR
    (status = 'processing' AND storage_key IS NOT NULL AND content IS NULL AND selection IS NULL
      AND source IS NULL AND provider IS NULL AND model IS NULL AND failure_code IS NULL
      AND completed_at IS NULL AND confirmed_at IS NULL AND deleted_at IS NULL)
    OR
    (status = 'ready' AND storage_key IS NOT NULL AND content IS NOT NULL AND selection IS NULL
      AND source IS NOT NULL AND provider IS NOT NULL AND model IS NOT NULL
      AND failure_code IS NULL AND completed_at IS NOT NULL
      AND confirmed_at IS NULL AND deleted_at IS NULL)
    OR
    (status = 'rejected' AND storage_key IS NULL AND content IS NOT NULL AND selection IS NULL
      AND source IS NOT NULL AND provider IS NOT NULL AND model IS NOT NULL
      AND completed_at IS NOT NULL AND confirmed_at IS NULL AND deleted_at IS NOT NULL)
    OR
    (status = 'failed' AND storage_key IS NULL AND content IS NULL AND selection IS NULL
      AND failure_code IS NOT NULL AND completed_at IS NOT NULL
      AND confirmed_at IS NULL AND deleted_at IS NOT NULL)
    OR
    (status = 'confirmed' AND storage_key IS NULL AND content IS NULL AND selection IS NOT NULL
      AND source IS NOT NULL AND provider IS NOT NULL AND model IS NOT NULL
      AND completed_at IS NOT NULL AND confirmed_at IS NOT NULL AND deleted_at IS NOT NULL)
    OR
    (status IN ('deleted', 'expired') AND storage_key IS NULL AND content IS NULL
      AND selection IS NULL AND deleted_at IS NOT NULL)
  )
);

CREATE INDEX nutrition_photo_candidates_user_active_idx
  ON nutrition_photo_candidates (user_id, created_at DESC)
  WHERE status IN ('reserved', 'processing', 'ready');

CREATE INDEX nutrition_photo_candidates_expiry_idx
  ON nutrition_photo_candidates (expires_at)
  WHERE status IN ('reserved', 'processing', 'ready');
