CREATE TABLE workout_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  status TEXT NOT NULL CHECK (status IN ('completed', 'partial')),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('manual', 'imported')),
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 64),
  pain_level INTEGER NOT NULL CHECK (pain_level BETWEEN 0 AND 10),
  fatigue INTEGER NOT NULL CHECK (fatigue BETWEEN 1 AND 5),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  request_hash CHAR(64) NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ended_at >= started_at),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX workout_sessions_user_started_idx
  ON workout_sessions (user_id, started_at DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE workout_exercises (
  id UUID PRIMARY KEY,
  workout_id UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 50),
  exercise_key TEXT NOT NULL CHECK (exercise_key ~ '^[a-z0-9_]{2,80}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  category TEXT NOT NULL CHECK (category IN ('strength', 'cardio', 'mobility')),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 300),
  UNIQUE (workout_id, position)
);

CREATE TABLE workout_sets (
  id UUID PRIMARY KEY,
  exercise_id UUID NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 100),
  kind TEXT NOT NULL CHECK (kind IN ('warmup', 'working', 'cooldown')),
  reps INTEGER CHECK (reps IS NULL OR reps BETWEEN 1 AND 1000),
  display_load NUMERIC(10, 3) CHECK (display_load IS NULL OR display_load BETWEEN 0 AND 1000),
  display_load_unit TEXT CHECK (display_load_unit IS NULL OR display_load_unit IN ('kg', 'lb')),
  canonical_load_kg NUMERIC(10, 4) CHECK (
    canonical_load_kg IS NULL OR canonical_load_kg BETWEEN 0 AND 1000
  ),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 86400),
  distance_meters NUMERIC(12, 2) CHECK (
    distance_meters IS NULL OR distance_meters BETWEEN 1 AND 500000
  ),
  rpe NUMERIC(4, 1) CHECK (rpe IS NULL OR rpe BETWEEN 1 AND 10),
  completed BOOLEAN NOT NULL,
  CHECK (reps IS NOT NULL OR duration_seconds IS NOT NULL OR distance_meters IS NOT NULL),
  CHECK (
    (display_load IS NULL AND display_load_unit IS NULL AND canonical_load_kg IS NULL)
    OR
    (display_load IS NOT NULL AND display_load_unit IS NOT NULL AND canonical_load_kg IS NOT NULL AND reps IS NOT NULL)
  ),
  UNIQUE (exercise_id, position)
);

CREATE TABLE workout_revisions (
  id UUID PRIMARY KEY,
  workout_id UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workout_id, revision)
);

CREATE INDEX workout_revisions_user_workout_idx
  ON workout_revisions (user_id, workout_id, revision DESC);
