ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_owner_revision_unique
  UNIQUE (user_id, revision);

ALTER TABLE user_goals
  ADD COLUMN goal_id UUID,
  ADD COLUMN revision INTEGER;

UPDATE user_goals AS goal
SET goal_id = gen_random_uuid(),
    revision = profile.revision
FROM user_profiles AS profile
WHERE profile.user_id = goal.user_id;

ALTER TABLE user_goals
  ALTER COLUMN goal_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN goal_id SET NOT NULL,
  ALTER COLUMN revision SET NOT NULL,
  ADD CONSTRAINT user_goals_revision_check CHECK (revision > 0),
  ADD CONSTRAINT user_goals_goal_id_unique UNIQUE (goal_id),
  ADD CONSTRAINT user_goals_owner_goal_unique UNIQUE (user_id, goal_id),
  ADD CONSTRAINT user_goals_profile_revision_fk
    FOREIGN KEY (user_id, revision)
    REFERENCES user_profiles(user_id, revision)
    DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION build_user_goal_revision_snapshot_v1(
  snapshot_user_id UUID,
  snapshot_goal_id UUID,
  snapshot_revision INTEGER,
  snapshot_action TEXT,
  snapshot_history_coverage TEXT,
  snapshot_primary_goal TEXT,
  snapshot_experience TEXT,
  snapshot_available_days TEXT[],
  snapshot_session_minutes INTEGER,
  snapshot_equipment TEXT[],
  snapshot_dietary_preferences TEXT[],
  snapshot_changed_at TIMESTAMPTZ
)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 'onboarding-goal-snapshot-v1',
    'goalId', snapshot_goal_id,
    'ownerUserId', snapshot_user_id,
    'revision', snapshot_revision,
    'action', snapshot_action,
    'historyCoverage', snapshot_history_coverage,
    'goal', jsonb_build_object(
      'primaryGoal', snapshot_primary_goal,
      'experience', snapshot_experience,
      'availableDays', snapshot_available_days,
      'sessionMinutes', snapshot_session_minutes,
      'equipment', snapshot_equipment,
      'dietaryPreferences', snapshot_dietary_preferences
    ),
    'changedAt', to_char(
      snapshot_changed_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  );
$$ LANGUAGE SQL IMMUTABLE;

CREATE TABLE user_goal_revisions (
  user_id UUID NOT NULL,
  goal_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  previous_revision INTEGER CHECK (previous_revision IS NULL OR previous_revision > 0),
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'migration_checkpoint')),
  history_coverage TEXT NOT NULL CHECK (history_coverage IN ('complete', 'checkpoint_only')),
  primary_goal TEXT NOT NULL CHECK (primary_goal IN (
    'fat_loss', 'muscle_gain', 'fitness', 'habit'
  )),
  experience TEXT NOT NULL CHECK (experience IN ('beginner', 'intermediate', 'advanced')),
  available_days TEXT[] NOT NULL CHECK (
    cardinality(available_days) BETWEEN 1 AND 7
    AND available_days <@ ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::TEXT[]
  ),
  session_minutes INTEGER NOT NULL CHECK (session_minutes BETWEEN 15 AND 180),
  equipment TEXT[] NOT NULL CHECK (
    cardinality(equipment) > 0
    AND equipment <@ ARRAY[
      'bodyweight', 'dumbbells', 'barbell', 'machines', 'bands', 'cardio'
    ]::TEXT[]
  ),
  dietary_preferences TEXT[] NOT NULL CHECK (
    cardinality(dietary_preferences) > 0
    AND dietary_preferences <@ ARRAY[
      'none', 'vegetarian', 'vegan', 'halal', 'lactose_free'
    ]::TEXT[]
    AND NOT ('none' = ANY(dietary_preferences) AND cardinality(dietary_preferences) > 1)
  ),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  changed_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT user_goal_revisions_goal_fk
    FOREIGN KEY (user_id, goal_id)
    REFERENCES user_goals(user_id, goal_id)
    ON DELETE CASCADE,
  CONSTRAINT user_goal_revisions_owner_goal_revision_unique
    UNIQUE (user_id, goal_id, revision),
  CONSTRAINT user_goal_revisions_goal_revision_unique
    UNIQUE (goal_id, revision),
  CONSTRAINT user_goal_revisions_previous_fk
    FOREIGN KEY (user_id, goal_id, previous_revision)
    REFERENCES user_goal_revisions(user_id, goal_id, revision)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT user_goal_revisions_action_relation_check CHECK (
    (
      action = 'created'
      AND revision = 1
      AND previous_revision IS NULL
      AND history_coverage = 'complete'
    )
    OR
    (
      action = 'migration_checkpoint'
      AND revision > 1
      AND previous_revision IS NULL
      AND history_coverage = 'checkpoint_only'
    )
    OR
    (
      action = 'updated'
      AND revision > 1
      AND previous_revision = revision - 1
    )
  ),
  CONSTRAINT user_goal_revisions_snapshot_exact_check CHECK (
    snapshot = build_user_goal_revision_snapshot_v1(
      user_id,
      goal_id,
      revision,
      action,
      history_coverage,
      primary_goal,
      experience,
      available_days,
      session_minutes,
      equipment,
      dietary_preferences,
      changed_at
    )
  )
);

CREATE INDEX user_goal_revisions_owner_goal_revision_idx
  ON user_goal_revisions (user_id, goal_id, revision DESC);

INSERT INTO user_goal_revisions (
  user_id,
  goal_id,
  revision,
  previous_revision,
  action,
  history_coverage,
  primary_goal,
  experience,
  available_days,
  session_minutes,
  equipment,
  dietary_preferences,
  snapshot,
  changed_at
)
SELECT
  goal.user_id,
  goal.goal_id,
  goal.revision,
  NULL,
  CASE WHEN goal.revision = 1 THEN 'created' ELSE 'migration_checkpoint' END,
  CASE WHEN goal.revision = 1 THEN 'complete' ELSE 'checkpoint_only' END,
  goal.primary_goal,
  goal.experience,
  goal.available_days,
  goal.session_minutes,
  goal.equipment,
  goal.dietary_preferences,
  build_user_goal_revision_snapshot_v1(
    goal.user_id,
    goal.goal_id,
    goal.revision,
    CASE WHEN goal.revision = 1 THEN 'created' ELSE 'migration_checkpoint' END,
    CASE WHEN goal.revision = 1 THEN 'complete' ELSE 'checkpoint_only' END,
    goal.primary_goal,
    goal.experience,
    goal.available_days,
    goal.session_minutes,
    goal.equipment,
    goal.dietary_preferences,
    goal.updated_at
  ),
  goal.updated_at
FROM user_goals AS goal;

CREATE FUNCTION enforce_user_goal_revision_chain()
RETURNS TRIGGER AS $$
DECLARE
  predecessor_coverage TEXT;
  predecessor_changed_at TIMESTAMPTZ;
BEGIN
  IF NEW.action <> 'updated' THEN
    RETURN NEW;
  END IF;

  SELECT history_coverage, changed_at
  INTO predecessor_coverage, predecessor_changed_at
  FROM user_goal_revisions
  WHERE user_id = NEW.user_id
    AND goal_id = NEW.goal_id
    AND revision = NEW.previous_revision;

  IF predecessor_coverage IS NULL
    OR NEW.history_coverage IS DISTINCT FROM predecessor_coverage
    OR NEW.changed_at < predecessor_changed_at THEN
    RAISE EXCEPTION 'user goal revision does not extend its exact history';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_goal_revisions_chain_guard
  BEFORE INSERT ON user_goal_revisions
  FOR EACH ROW EXECUTE FUNCTION enforce_user_goal_revision_chain();

CREATE FUNCTION enforce_user_goal_current_projection()
RETURNS TRIGGER AS $$
DECLARE
  projection_user_id UUID;
  projection_goal_id UUID;
  projection_revision INTEGER;
  current_goal user_goals%ROWTYPE;
  history user_goal_revisions%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'user_goals' THEN
    projection_user_id := NEW.user_id;
    projection_goal_id := NEW.goal_id;
    projection_revision := NEW.revision;
  ELSE
    projection_user_id := NEW.user_id;
    projection_goal_id := NEW.goal_id;
    projection_revision := NEW.revision;
  END IF;

  SELECT *
  INTO current_goal
  FROM user_goals
  WHERE user_id = projection_user_id
    AND goal_id = projection_goal_id;

  SELECT *
  INTO history
  FROM user_goal_revisions
  WHERE user_id = projection_user_id
    AND goal_id = projection_goal_id
    AND revision = projection_revision;

  IF current_goal.user_id IS NULL
    OR history.user_id IS NULL
    OR current_goal.revision IS DISTINCT FROM projection_revision
    OR current_goal.updated_at IS DISTINCT FROM history.changed_at
    OR current_goal.primary_goal IS DISTINCT FROM history.primary_goal
    OR current_goal.experience IS DISTINCT FROM history.experience
    OR current_goal.available_days IS DISTINCT FROM history.available_days
    OR current_goal.session_minutes IS DISTINCT FROM history.session_minutes
    OR current_goal.equipment IS DISTINCT FROM history.equipment
    OR current_goal.dietary_preferences IS DISTINCT FROM history.dietary_preferences THEN
    RAISE EXCEPTION 'user goal current row does not match its immutable revision';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER user_goals_current_revision_guard
  AFTER INSERT OR UPDATE ON user_goals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_user_goal_current_projection();

CREATE CONSTRAINT TRIGGER user_goal_revisions_current_guard
  AFTER INSERT ON user_goal_revisions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_user_goal_current_projection();

CREATE FUNCTION reject_user_goal_current_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'user goals cannot be directly deleted';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.goal_id IS DISTINCT FROM OLD.goal_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.revision IS DISTINCT FROM OLD.revision + 1
    OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'user goal updates must append exactly one revision';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_goals_lifecycle_guard
  BEFORE UPDATE OR DELETE ON user_goals
  FOR EACH ROW EXECUTE FUNCTION reject_user_goal_current_mutation();

CREATE FUNCTION reject_user_goal_revision_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'user goal revisions are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_goal_revisions_immutable
  BEFORE UPDATE OR DELETE ON user_goal_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_user_goal_revision_mutation();
