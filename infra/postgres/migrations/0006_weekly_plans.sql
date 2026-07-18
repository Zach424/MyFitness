CREATE TABLE weekly_plans (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  timezone TEXT NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 64),
  engine_version TEXT NOT NULL CHECK (engine_version = 'deterministic-v1'),
  status TEXT NOT NULL CHECK (status IN ('draft', 'accepted', 'modified', 'skipped')),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  request_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  UNIQUE (user_id, week_start),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX weekly_plans_user_week_idx ON weekly_plans (user_id, week_start DESC);

CREATE TABLE weekly_plan_revisions (
  id UUID PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('generated', 'accepted', 'modified', 'skipped')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  decision_note TEXT CHECK (decision_note IS NULL OR char_length(decision_note) <= 300),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, revision)
);

CREATE INDEX weekly_plan_revisions_user_plan_idx
  ON weekly_plan_revisions (user_id, plan_id, revision DESC);
