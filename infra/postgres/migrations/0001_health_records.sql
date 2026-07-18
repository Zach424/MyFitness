CREATE TABLE health_records (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN (
    'body.weight',
    'body.waist',
    'body.body_fat',
    'body.resting_heart_rate',
    'recovery.sleep_duration',
    'recovery.sleep_quality',
    'recovery.soreness',
    'recovery.energy',
    'recovery.stress'
  )),
  canonical_value NUMERIC(14, 4) NOT NULL,
  canonical_unit TEXT NOT NULL CHECK (canonical_unit IN (
    'kg', 'cm', 'percent', 'bpm', 'minute', 'score_1_5'
  )),
  display_value NUMERIC(14, 4) NOT NULL,
  display_unit TEXT NOT NULL CHECK (display_unit IN (
    'kg', 'lb', 'cm', 'in', 'percent', 'bpm', 'minute', 'hour', 'score_1_5'
  )),
  source_kind TEXT NOT NULL CHECK (source_kind IN (
    'manual', 'device', 'imported', 'ai_estimate'
  )),
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(5, 4),
  status TEXT NOT NULL CHECK (status IN ('candidate', 'confirmed')),
  occurred_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 64),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  request_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT health_records_ai_candidate CHECK (
    source_kind <> 'ai_estimate'
    OR (
      status = 'candidate'
      AND confidence IS NOT NULL
      AND source_metadata ? 'modelVersion'
      AND source_metadata ? 'promptVersion'
    )
  ),
  CONSTRAINT health_records_non_ai_confirmed CHECK (
    source_kind = 'ai_estimate'
    OR (status = 'confirmed' AND confidence IS NULL)
  ),
  CONSTRAINT health_records_confidence_range CHECK (
    confidence IS NULL OR confidence BETWEEN 0 AND 1
  ),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX health_records_user_occurred_idx
  ON health_records (user_id, occurred_at DESC, created_at DESC);

CREATE INDEX health_records_user_metric_occurred_idx
  ON health_records (user_id, metric, occurred_at DESC);
