ALTER TABLE health_records
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD CONSTRAINT health_records_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE health_record_revisions (
  id UUID PRIMARY KEY,
  record_id UUID NOT NULL REFERENCES health_records(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  revision INTEGER NOT NULL CHECK (revision > 0),
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
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT health_record_revisions_ai_candidate CHECK (
    source_kind <> 'ai_estimate'
    OR (
      status = 'candidate'
      AND confidence IS NOT NULL
      AND source_metadata ? 'modelVersion'
      AND source_metadata ? 'promptVersion'
    )
  ),
  CONSTRAINT health_record_revisions_non_ai_confirmed CHECK (
    source_kind = 'ai_estimate'
    OR (status = 'confirmed' AND confidence IS NULL)
  ),
  CONSTRAINT health_record_revisions_confidence_range CHECK (
    confidence IS NULL OR confidence BETWEEN 0 AND 1
  ),
  UNIQUE (record_id, revision)
);

INSERT INTO health_record_revisions (
  id, record_id, user_id, action, revision, metric,
  canonical_value, canonical_unit, display_value, display_unit,
  source_kind, source_metadata, confidence, status,
  occurred_at, timezone, created_at, updated_at, changed_at
)
SELECT
  gen_random_uuid(), id, user_id, 'created', revision, metric,
  canonical_value, canonical_unit, display_value, display_unit,
  source_kind, source_metadata, confidence, status,
  occurred_at, timezone, created_at, updated_at, updated_at
FROM health_records;

CREATE INDEX health_record_revisions_user_record_idx
  ON health_record_revisions (user_id, record_id, revision DESC);
