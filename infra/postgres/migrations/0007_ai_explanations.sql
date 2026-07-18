ALTER TABLE consent_events
  DROP CONSTRAINT consent_events_purpose_check;

ALTER TABLE consent_events
  ADD CONSTRAINT consent_events_purpose_check
  CHECK (purpose IN ('terms', 'privacy', 'health_data', 'ai_plan_explanation'));

CREATE TABLE ai_explanation_runs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
  plan_revision INTEGER NOT NULL CHECK (plan_revision > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
  source TEXT CHECK (source IS NULL OR source IN ('model', 'fixture', 'fallback')),
  provider TEXT CHECK (provider IS NULL OR provider IN ('fixture', 'openai', 'unavailable')),
  model TEXT CHECK (model IS NULL OR char_length(model) BETWEEN 1 AND 120),
  prompt_version TEXT NOT NULL CHECK (prompt_version = 'plan-explanation-v1'),
  validator_version TEXT NOT NULL CHECK (validator_version = 'plan-explanation-safety-v1'),
  input_fingerprint CHAR(64) NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  consent_event_id UUID NOT NULL REFERENCES consent_events(id),
  content JSONB CHECK (content IS NULL OR jsonb_typeof(content) = 'object'),
  safety_note TEXT,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, idempotency_key),
  CHECK (
    (status = 'pending' AND source IS NULL AND provider IS NULL AND model IS NULL
      AND content IS NULL AND safety_note IS NULL AND completed_at IS NULL)
    OR
    (status = 'completed' AND source IS NOT NULL AND provider IS NOT NULL AND model IS NOT NULL
      AND content IS NOT NULL AND safety_note IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX ai_explanation_runs_user_plan_idx
  ON ai_explanation_runs (user_id, plan_id, created_at DESC)
  WHERE status = 'completed';
