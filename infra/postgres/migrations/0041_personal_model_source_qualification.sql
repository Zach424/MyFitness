ALTER TABLE workout_revisions
  ADD CONSTRAINT workout_revisions_owner_workout_revision_unique
  UNIQUE (user_id, workout_id, revision);

ALTER TABLE personal_model_evidence_refs
  ADD COLUMN onboarding_goal_id UUID GENERATED ALWAYS AS (
    CASE
      WHEN evidence_kind = 'onboarding_goal_revision' THEN aggregate_id
      ELSE NULL
    END
  ) STORED,
  ADD COLUMN onboarding_goal_revision INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN evidence_kind = 'onboarding_goal_revision' THEN aggregate_revision
      ELSE NULL
    END
  ) STORED,
  ADD COLUMN workout_id UUID GENERATED ALWAYS AS (
    CASE
      WHEN evidence_kind = 'workout_revision' THEN aggregate_id
      ELSE NULL
    END
  ) STORED,
  ADD COLUMN workout_revision INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN evidence_kind = 'workout_revision' THEN aggregate_revision
      ELSE NULL
    END
  ) STORED,
  ADD CONSTRAINT personal_model_evidence_refs_onboarding_source_fk
    FOREIGN KEY (user_id, onboarding_goal_id, onboarding_goal_revision)
    REFERENCES user_goal_revisions(user_id, goal_id, revision)
    DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT personal_model_evidence_refs_workout_source_fk
    FOREIGN KEY (user_id, workout_id, workout_revision)
    REFERENCES workout_revisions(user_id, workout_id, revision)
    DEFERRABLE INITIALLY DEFERRED;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM personal_model_evidence_refs AS evidence
    LEFT JOIN user_goal_revisions AS goal
      ON goal.user_id = evidence.user_id
     AND goal.goal_id = evidence.aggregate_id
     AND goal.revision = evidence.aggregate_revision
    WHERE evidence.evidence_kind = 'onboarding_goal_revision'
      AND (
        goal.user_id IS NULL
        OR (evidence.reference #>> '{time,occurredAt}')::TIMESTAMPTZ
          IS DISTINCT FROM goal.changed_at
      )
  ) THEN
    RAISE EXCEPTION 'existing onboarding goal evidence does not match its exact source';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM personal_model_evidence_refs AS evidence
    LEFT JOIN workout_revisions AS workout
      ON workout.user_id = evidence.user_id
     AND workout.workout_id = evidence.aggregate_id
     AND workout.revision = evidence.aggregate_revision
    WHERE evidence.evidence_kind = 'workout_revision'
      AND (
        workout.user_id IS NULL
        OR workout.snapshot ->> 'userId' IS DISTINCT FROM evidence.user_id::TEXT
        OR workout.snapshot ->> 'id' IS DISTINCT FROM evidence.aggregate_id::TEXT
        OR (workout.snapshot ->> 'revision')::INTEGER
          IS DISTINCT FROM evidence.aggregate_revision
        OR workout.snapshot #>> '{source,kind}' IS DISTINCT FROM evidence.source_kind
        OR (workout.snapshot ->> 'startedAt')::TIMESTAMPTZ
          IS DISTINCT FROM (evidence.reference #>> '{time,startedAt}')::TIMESTAMPTZ
        OR (workout.snapshot ->> 'endedAt')::TIMESTAMPTZ
          IS DISTINCT FROM (evidence.reference #>> '{time,endedAt}')::TIMESTAMPTZ
        OR workout.snapshot ->> 'timezone'
          IS DISTINCT FROM evidence.reference #>> '{time,timezone}'
      )
  ) THEN
    RAISE EXCEPTION 'existing workout evidence does not match its exact source';
  END IF;
END;
$$;

CREATE FUNCTION enforce_personal_model_evidence_source_qualification()
RETURNS TRIGGER AS $$
DECLARE
  source_changed_at TIMESTAMPTZ;
  source_action TEXT;
  source_snapshot JSONB;
  current_revision INTEGER;
  current_deleted_at TIMESTAMPTZ;
BEGIN
  IF NEW.evidence_kind = 'onboarding_goal_revision' THEN
    SELECT history.changed_at, current_goal.revision
    INTO source_changed_at, current_revision
    FROM user_goal_revisions AS history
    JOIN user_goals AS current_goal
      ON current_goal.user_id = history.user_id
     AND current_goal.goal_id = history.goal_id
    WHERE history.user_id = NEW.user_id
      AND history.goal_id = NEW.aggregate_id
      AND history.revision = NEW.aggregate_revision;

    IF source_changed_at IS NULL
      OR (NEW.reference #>> '{time,occurredAt}')::TIMESTAMPTZ
        IS DISTINCT FROM source_changed_at THEN
      RAISE EXCEPTION 'onboarding goal evidence does not match its exact source';
    END IF;

    IF NEW.qualification = 'eligible'
      AND current_revision IS DISTINCT FROM NEW.aggregate_revision THEN
      RAISE EXCEPTION 'onboarding goal evidence is no longer current';
    END IF;

    IF NEW.withdrawn_reason = 'source_corrected'
      AND current_revision <= NEW.aggregate_revision THEN
      RAISE EXCEPTION 'onboarding goal evidence was not corrected';
    END IF;

    IF NEW.withdrawn_reason = 'source_deleted' THEN
      RAISE EXCEPTION 'onboarding goal evidence cannot outlive its owner as deleted evidence';
    END IF;

    RETURN NULL;
  END IF;

  SELECT history.action, history.snapshot, current_workout.revision,
         current_workout.deleted_at
  INTO source_action, source_snapshot, current_revision, current_deleted_at
  FROM workout_revisions AS history
  JOIN workout_sessions AS current_workout
    ON current_workout.user_id = history.user_id
   AND current_workout.id = history.workout_id
  WHERE history.user_id = NEW.user_id
    AND history.workout_id = NEW.aggregate_id
    AND history.revision = NEW.aggregate_revision;

  IF source_action IS NULL
    OR source_snapshot ->> 'userId' IS DISTINCT FROM NEW.user_id::TEXT
    OR source_snapshot ->> 'id' IS DISTINCT FROM NEW.aggregate_id::TEXT
    OR (source_snapshot ->> 'revision')::INTEGER IS DISTINCT FROM NEW.aggregate_revision
    OR source_snapshot #>> '{source,kind}' IS DISTINCT FROM NEW.source_kind
    OR (source_snapshot ->> 'startedAt')::TIMESTAMPTZ
      IS DISTINCT FROM (NEW.reference #>> '{time,startedAt}')::TIMESTAMPTZ
    OR (source_snapshot ->> 'endedAt')::TIMESTAMPTZ
      IS DISTINCT FROM (NEW.reference #>> '{time,endedAt}')::TIMESTAMPTZ
    OR source_snapshot ->> 'timezone'
      IS DISTINCT FROM NEW.reference #>> '{time,timezone}' THEN
    RAISE EXCEPTION 'workout evidence does not match its exact source';
  END IF;

  IF NEW.qualification = 'eligible'
    AND (
      source_action = 'deleted'
      OR current_deleted_at IS NOT NULL
      OR current_revision IS DISTINCT FROM NEW.aggregate_revision
    ) THEN
    RAISE EXCEPTION 'workout evidence is no longer current';
  END IF;

  IF NEW.withdrawn_reason = 'source_corrected'
    AND (
      current_deleted_at IS NOT NULL
      OR current_revision <= NEW.aggregate_revision
    ) THEN
    RAISE EXCEPTION 'workout evidence was not corrected';
  END IF;

  IF NEW.withdrawn_reason = 'source_deleted'
    AND (
      current_deleted_at IS NULL
      OR current_revision <= NEW.aggregate_revision
    ) THEN
    RAISE EXCEPTION 'workout evidence was not deleted after the referenced revision';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER personal_model_evidence_refs_source_qualification_guard
  AFTER INSERT ON personal_model_evidence_refs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_personal_model_evidence_source_qualification();

CREATE TABLE personal_model_source_refresh_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  item_id UUID NOT NULL,
  affected_item_revision INTEGER NOT NULL CHECK (affected_item_revision > 0),
  affected_reference_id UUID NOT NULL,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN (
    'onboarding_goal_revision',
    'workout_revision'
  )),
  source_aggregate_id UUID NOT NULL,
  withdrawn_source_revision INTEGER NOT NULL CHECK (withdrawn_source_revision > 0),
  observed_source_revision INTEGER NOT NULL CHECK (
    observed_source_revision > withdrawn_source_revision
  ),
  reason TEXT NOT NULL CHECK (reason IN ('source_corrected', 'source_deleted')),
  created_at TIMESTAMPTZ NOT NULL,
  onboarding_goal_id UUID GENERATED ALWAYS AS (
    CASE
      WHEN evidence_kind = 'onboarding_goal_revision' THEN source_aggregate_id
      ELSE NULL
    END
  ) STORED,
  onboarding_withdrawn_revision INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN evidence_kind = 'onboarding_goal_revision' THEN withdrawn_source_revision
      ELSE NULL
    END
  ) STORED,
  onboarding_observed_revision INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN evidence_kind = 'onboarding_goal_revision' THEN observed_source_revision
      ELSE NULL
    END
  ) STORED,
  workout_id UUID GENERATED ALWAYS AS (
    CASE
      WHEN evidence_kind = 'workout_revision' THEN source_aggregate_id
      ELSE NULL
    END
  ) STORED,
  workout_withdrawn_revision INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN evidence_kind = 'workout_revision' THEN withdrawn_source_revision
      ELSE NULL
    END
  ) STORED,
  workout_observed_revision INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN evidence_kind = 'workout_revision' THEN observed_source_revision
      ELSE NULL
    END
  ) STORED,
  CONSTRAINT personal_model_source_refresh_requests_reason_relation_check CHECK (
    (evidence_kind = 'onboarding_goal_revision' AND reason = 'source_corrected')
    OR evidence_kind = 'workout_revision'
  ),
  CONSTRAINT personal_model_source_refresh_requests_evidence_fk
    FOREIGN KEY (user_id, item_id, affected_item_revision, affected_reference_id)
    REFERENCES personal_model_evidence_refs(
      user_id, item_id, item_revision, reference_id
    )
    ON DELETE CASCADE,
  CONSTRAINT personal_model_source_refresh_requests_onboarding_withdrawn_fk
    FOREIGN KEY (user_id, onboarding_goal_id, onboarding_withdrawn_revision)
    REFERENCES user_goal_revisions(user_id, goal_id, revision)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT personal_model_source_refresh_requests_onboarding_observed_fk
    FOREIGN KEY (user_id, onboarding_goal_id, onboarding_observed_revision)
    REFERENCES user_goal_revisions(user_id, goal_id, revision)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT personal_model_source_refresh_requests_workout_withdrawn_fk
    FOREIGN KEY (user_id, workout_id, workout_withdrawn_revision)
    REFERENCES workout_revisions(user_id, workout_id, revision)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT personal_model_source_refresh_requests_workout_observed_fk
    FOREIGN KEY (user_id, workout_id, workout_observed_revision)
    REFERENCES workout_revisions(user_id, workout_id, revision)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT personal_model_source_refresh_requests_source_unique
    UNIQUE (
      user_id,
      item_id,
      evidence_kind,
      source_aggregate_id,
      withdrawn_source_revision
    )
);

CREATE INDEX personal_model_source_refresh_requests_owner_item_idx
  ON personal_model_source_refresh_requests (
    user_id,
    item_id,
    affected_item_revision,
    created_at,
    id
  );

CREATE TABLE personal_model_source_refresh_resolutions (
  request_id UUID PRIMARY KEY
    REFERENCES personal_model_source_refresh_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  item_id UUID NOT NULL,
  resolved_item_revision INTEGER NOT NULL CHECK (resolved_item_revision > 1),
  withdrawn_reference_id UUID NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT personal_model_source_refresh_resolutions_revision_fk
    FOREIGN KEY (user_id, item_id, resolved_item_revision)
    REFERENCES personal_model_item_revisions(user_id, item_id, revision)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT personal_model_source_refresh_resolutions_evidence_fk
    FOREIGN KEY (user_id, item_id, resolved_item_revision, withdrawn_reference_id)
    REFERENCES personal_model_evidence_refs(
      user_id, item_id, item_revision, reference_id
    )
    DEFERRABLE INITIALLY DEFERRED
);

CREATE FUNCTION enforce_personal_model_source_refresh_request()
RETURNS TRIGGER AS $$
DECLARE
  evidence personal_model_evidence_refs%ROWTYPE;
  item_current_revision INTEGER;
  observed_changed_at TIMESTAMPTZ;
  observed_action TEXT;
  current_source_revision INTEGER;
  current_source_deleted_at TIMESTAMPTZ;
BEGIN
  SELECT *
  INTO evidence
  FROM personal_model_evidence_refs
  WHERE user_id = NEW.user_id
    AND item_id = NEW.item_id
    AND item_revision = NEW.affected_item_revision
    AND reference_id = NEW.affected_reference_id;

  SELECT current_revision
  INTO item_current_revision
  FROM personal_model_items
  WHERE user_id = NEW.user_id AND id = NEW.item_id;

  IF evidence.user_id IS NULL
    OR evidence.evidence_kind IS DISTINCT FROM NEW.evidence_kind
    OR evidence.aggregate_id IS DISTINCT FROM NEW.source_aggregate_id
    OR evidence.aggregate_revision IS DISTINCT FROM NEW.withdrawn_source_revision
    OR evidence.qualification IS DISTINCT FROM 'eligible'
    OR item_current_revision IS DISTINCT FROM NEW.affected_item_revision THEN
    RAISE EXCEPTION 'source refresh request does not target current eligible evidence';
  END IF;

  IF NEW.evidence_kind = 'onboarding_goal_revision' THEN
    SELECT history.changed_at, current_goal.revision
    INTO observed_changed_at, current_source_revision
    FROM user_goal_revisions AS history
    JOIN user_goals AS current_goal
      ON current_goal.user_id = history.user_id
     AND current_goal.goal_id = history.goal_id
    WHERE history.user_id = NEW.user_id
      AND history.goal_id = NEW.source_aggregate_id
      AND history.revision = NEW.observed_source_revision;

    IF NEW.reason <> 'source_corrected'
      OR current_source_revision IS DISTINCT FROM NEW.observed_source_revision
      OR observed_changed_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'onboarding goal source refresh request is inconsistent';
    END IF;

    RETURN NULL;
  END IF;

  SELECT history.action, history.changed_at,
         current_workout.revision, current_workout.deleted_at
  INTO observed_action, observed_changed_at,
       current_source_revision, current_source_deleted_at
  FROM workout_revisions AS history
  JOIN workout_sessions AS current_workout
    ON current_workout.user_id = history.user_id
   AND current_workout.id = history.workout_id
  WHERE history.user_id = NEW.user_id
    AND history.workout_id = NEW.source_aggregate_id
    AND history.revision = NEW.observed_source_revision;

  IF current_source_revision IS DISTINCT FROM NEW.observed_source_revision
    OR observed_changed_at IS DISTINCT FROM NEW.created_at
    OR (NEW.reason = 'source_corrected' AND (
      observed_action <> 'updated' OR current_source_deleted_at IS NOT NULL
    ))
    OR (NEW.reason = 'source_deleted' AND (
      observed_action <> 'deleted' OR current_source_deleted_at IS NULL
    )) THEN
    RAISE EXCEPTION 'workout source refresh request is inconsistent';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER personal_model_source_refresh_requests_exact_guard
  AFTER INSERT ON personal_model_source_refresh_requests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_personal_model_source_refresh_request();

CREATE FUNCTION enforce_personal_model_source_refresh_resolution()
RETURNS TRIGGER AS $$
DECLARE
  request personal_model_source_refresh_requests%ROWTYPE;
  evidence personal_model_evidence_refs%ROWTYPE;
  revision_changed_at TIMESTAMPTZ;
BEGIN
  SELECT *
  INTO request
  FROM personal_model_source_refresh_requests
  WHERE id = NEW.request_id;

  SELECT *
  INTO evidence
  FROM personal_model_evidence_refs
  WHERE user_id = NEW.user_id
    AND item_id = NEW.item_id
    AND item_revision = NEW.resolved_item_revision
    AND reference_id = NEW.withdrawn_reference_id;

  SELECT changed_at
  INTO revision_changed_at
  FROM personal_model_item_revisions
  WHERE user_id = NEW.user_id
    AND item_id = NEW.item_id
    AND revision = NEW.resolved_item_revision;

  IF request.id IS NULL
    OR request.user_id IS DISTINCT FROM NEW.user_id
    OR request.item_id IS DISTINCT FROM NEW.item_id
    OR NEW.resolved_item_revision <= request.affected_item_revision
    OR evidence.user_id IS NULL
    OR evidence.evidence_kind IS DISTINCT FROM request.evidence_kind
    OR evidence.aggregate_id IS DISTINCT FROM request.source_aggregate_id
    OR evidence.aggregate_revision IS DISTINCT FROM request.withdrawn_source_revision
    OR evidence.qualification IS DISTINCT FROM 'withdrawn'
    OR evidence.withdrawn_reason IS DISTINCT FROM request.reason
    OR evidence.role IS DISTINCT FROM 'context'
    OR revision_changed_at IS DISTINCT FROM NEW.resolved_at THEN
    RAISE EXCEPTION 'source refresh resolution does not contain the required withdrawal';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER personal_model_source_refresh_resolutions_exact_guard
  AFTER INSERT ON personal_model_source_refresh_resolutions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_personal_model_source_refresh_resolution();

CREATE FUNCTION enforce_personal_model_revision_resolves_source_refresh()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM personal_model_source_refresh_requests AS request
    LEFT JOIN personal_model_source_refresh_resolutions AS resolution
      ON resolution.request_id = request.id
    WHERE request.user_id = NEW.user_id
      AND request.item_id = NEW.item_id
      AND request.affected_item_revision < NEW.revision
      AND resolution.request_id IS NULL
  ) THEN
    RAISE EXCEPTION 'personal model revision omitted a pending source withdrawal';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER personal_model_item_revisions_source_refresh_guard
  AFTER INSERT ON personal_model_item_revisions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_personal_model_revision_resolves_source_refresh();

CREATE FUNCTION enqueue_personal_model_source_refresh()
RETURNS TRIGGER AS $$
DECLARE
  source_evidence_kind TEXT;
  refresh_reason TEXT;
  source_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'user_goal_revisions' THEN
    IF NEW.action <> 'updated' THEN
      RETURN NEW;
    END IF;
    source_evidence_kind := 'onboarding_goal_revision';
    refresh_reason := 'source_corrected';
    source_id := NEW.goal_id;
  ELSE
    IF NEW.action = 'created' THEN
      RETURN NEW;
    END IF;
    source_evidence_kind := 'workout_revision';
    refresh_reason := CASE WHEN NEW.action = 'deleted' THEN 'source_deleted' ELSE 'source_corrected' END;
    source_id := NEW.workout_id;
  END IF;

  INSERT INTO personal_model_source_refresh_requests (
    id,
    user_id,
    item_id,
    affected_item_revision,
    affected_reference_id,
    evidence_kind,
    source_aggregate_id,
    withdrawn_source_revision,
    observed_source_revision,
    reason,
    created_at
  )
  SELECT
    gen_random_uuid(),
    evidence.user_id,
    evidence.item_id,
    evidence.item_revision,
    evidence.reference_id,
    source_evidence_kind,
    source_id,
    evidence.aggregate_revision,
    NEW.revision,
    refresh_reason,
    NEW.changed_at
  FROM personal_model_evidence_refs AS evidence
  JOIN personal_model_items AS item
    ON item.user_id = evidence.user_id
   AND item.id = evidence.item_id
   AND item.current_revision = evidence.item_revision
  WHERE evidence.user_id = NEW.user_id
    AND evidence.evidence_kind = source_evidence_kind
    AND evidence.aggregate_id = source_id
    AND evidence.aggregate_revision < NEW.revision
    AND evidence.qualification = 'eligible'
  ON CONFLICT (
    user_id,
    item_id,
    evidence_kind,
    source_aggregate_id,
    withdrawn_source_revision
  ) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_goal_revisions_personal_model_refresh
  AFTER INSERT ON user_goal_revisions
  FOR EACH ROW EXECUTE FUNCTION enqueue_personal_model_source_refresh();

CREATE TRIGGER workout_revisions_personal_model_refresh
  AFTER INSERT ON workout_revisions
  FOR EACH ROW EXECUTE FUNCTION enqueue_personal_model_source_refresh();

INSERT INTO personal_model_source_refresh_requests (
  id,
  user_id,
  item_id,
  affected_item_revision,
  affected_reference_id,
  evidence_kind,
  source_aggregate_id,
  withdrawn_source_revision,
  observed_source_revision,
  reason,
  created_at
)
SELECT
  gen_random_uuid(),
  evidence.user_id,
  evidence.item_id,
  evidence.item_revision,
  evidence.reference_id,
  evidence.evidence_kind,
  evidence.aggregate_id,
  evidence.aggregate_revision,
  current_goal.revision,
  'source_corrected',
  current_goal.updated_at
FROM personal_model_evidence_refs AS evidence
JOIN personal_model_items AS item
  ON item.user_id = evidence.user_id
 AND item.id = evidence.item_id
 AND item.current_revision = evidence.item_revision
JOIN user_goals AS current_goal
  ON current_goal.user_id = evidence.user_id
 AND current_goal.goal_id = evidence.aggregate_id
WHERE evidence.evidence_kind = 'onboarding_goal_revision'
  AND evidence.qualification = 'eligible'
  AND evidence.aggregate_revision < current_goal.revision
ON CONFLICT (
  user_id,
  item_id,
  evidence_kind,
  source_aggregate_id,
  withdrawn_source_revision
) DO NOTHING;

INSERT INTO personal_model_source_refresh_requests (
  id,
  user_id,
  item_id,
  affected_item_revision,
  affected_reference_id,
  evidence_kind,
  source_aggregate_id,
  withdrawn_source_revision,
  observed_source_revision,
  reason,
  created_at
)
SELECT
  gen_random_uuid(),
  evidence.user_id,
  evidence.item_id,
  evidence.item_revision,
  evidence.reference_id,
  evidence.evidence_kind,
  evidence.aggregate_id,
  evidence.aggregate_revision,
  current_workout.revision,
  CASE
    WHEN current_workout.deleted_at IS NULL THEN 'source_corrected'
    ELSE 'source_deleted'
  END,
  current_revision.changed_at
FROM personal_model_evidence_refs AS evidence
JOIN personal_model_items AS item
  ON item.user_id = evidence.user_id
 AND item.id = evidence.item_id
 AND item.current_revision = evidence.item_revision
JOIN workout_sessions AS current_workout
  ON current_workout.user_id = evidence.user_id
 AND current_workout.id = evidence.aggregate_id
JOIN workout_revisions AS current_revision
  ON current_revision.user_id = current_workout.user_id
 AND current_revision.workout_id = current_workout.id
 AND current_revision.revision = current_workout.revision
WHERE evidence.evidence_kind = 'workout_revision'
  AND evidence.qualification = 'eligible'
  AND evidence.aggregate_revision < current_workout.revision
ON CONFLICT (
  user_id,
  item_id,
  evidence_kind,
  source_aggregate_id,
  withdrawn_source_revision
) DO NOTHING;

CREATE FUNCTION reject_personal_model_source_refresh_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'personal model source refresh records are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER personal_model_source_refresh_requests_immutable
  BEFORE UPDATE OR DELETE ON personal_model_source_refresh_requests
  FOR EACH ROW EXECUTE FUNCTION reject_personal_model_source_refresh_mutation();

CREATE TRIGGER personal_model_source_refresh_resolutions_immutable
  BEFORE UPDATE OR DELETE ON personal_model_source_refresh_resolutions
  FOR EACH ROW EXECUTE FUNCTION reject_personal_model_source_refresh_mutation();
