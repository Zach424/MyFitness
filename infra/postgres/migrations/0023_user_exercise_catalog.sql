CREATE TABLE user_exercise_catalog_entries (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  aliases TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL CHECK (category IN ('strength', 'cardio', 'mobility')),
  tracking_mode TEXT NOT NULL CHECK (
    tracking_mode IN ('reps_load', 'duration', 'duration_distance')
  ),
  equipment TEXT[] NOT NULL CHECK (
    cardinality(equipment) BETWEEN 1 AND 6
    AND equipment <@ ARRAY[
      'bodyweight', 'dumbbells', 'barbell', 'kettlebell', 'resistance_band', 'bench',
      'pull_up_bar', 'cable_machine', 'cardio_machine', 'bicycle', 'open_space', 'other'
    ]::text[]
  ),
  equipment_notes TEXT CHECK (
    equipment_notes IS NULL OR char_length(equipment_notes) BETWEEN 1 AND 120
  ),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  request_hash CHAR(64) NOT NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT ('other' = ANY(equipment)) OR equipment_notes IS NOT NULL),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX user_exercise_catalog_active_name_unique
  ON user_exercise_catalog_entries (user_id, lower(btrim(name)))
  WHERE archived_at IS NULL;

CREATE INDEX user_exercise_catalog_user_updated_idx
  ON user_exercise_catalog_entries (user_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE user_exercise_catalog_revisions (
  id UUID PRIMARY KEY,
  entry_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'archived')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_id, revision),
  CONSTRAINT user_exercise_catalog_revision_owner_fk
    FOREIGN KEY (entry_id, user_id)
    REFERENCES user_exercise_catalog_entries(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX user_exercise_catalog_revisions_user_entry_idx
  ON user_exercise_catalog_revisions (user_id, entry_id, revision DESC);

ALTER TABLE workout_exercises
  ADD COLUMN tracking_mode TEXT CHECK (
    tracking_mode IS NULL OR tracking_mode IN ('reps_load', 'duration', 'duration_distance')
  ),
  ADD COLUMN equipment TEXT[] NOT NULL DEFAULT '{}' CHECK (
    cardinality(equipment) <= 6
    AND equipment <@ ARRAY[
      'bodyweight', 'dumbbells', 'barbell', 'kettlebell', 'resistance_band', 'bench',
      'pull_up_bar', 'cable_machine', 'cardio_machine', 'bicycle', 'open_space', 'other'
    ]::text[]
  ),
  ADD COLUMN equipment_notes TEXT CHECK (
    equipment_notes IS NULL OR char_length(equipment_notes) BETWEEN 1 AND 120
  ),
  ADD CONSTRAINT workout_exercises_other_equipment_notes_check CHECK (
    NOT ('other' = ANY(equipment)) OR equipment_notes IS NOT NULL
  );
