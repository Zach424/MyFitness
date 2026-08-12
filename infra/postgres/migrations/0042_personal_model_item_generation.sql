ALTER TABLE personal_model_items
  ADD COLUMN generation INTEGER NOT NULL DEFAULT 1 CHECK (generation > 0),
  ADD COLUMN predecessor_item_id UUID,
  ADD COLUMN retired_at TIMESTAMPTZ,
  ADD CONSTRAINT personal_model_items_generation_predecessor_shape_check CHECK (
    (generation = 1 AND predecessor_item_id IS NULL)
    OR
    (generation > 1 AND predecessor_item_id IS NOT NULL)
  ),
  ADD CONSTRAINT personal_model_items_predecessor_not_self_check CHECK (
    predecessor_item_id IS NULL OR predecessor_item_id <> id
  ),
  ADD CONSTRAINT personal_model_items_retired_time_check CHECK (
    retired_at IS NULL OR retired_at = updated_at
  );

ALTER TABLE personal_model_items
  DROP CONSTRAINT personal_model_items_owner_subject_unique,
  ADD CONSTRAINT personal_model_items_owner_subject_generation_unique
    UNIQUE (user_id, subject_key, generation),
  ADD CONSTRAINT personal_model_items_owner_predecessor_unique
    UNIQUE (user_id, predecessor_item_id),
  ADD CONSTRAINT personal_model_items_predecessor_subject_fk
    FOREIGN KEY (user_id, predecessor_item_id, subject_key)
    REFERENCES personal_model_items(user_id, id, subject_key)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX personal_model_items_owner_current_subject_unique
  ON personal_model_items (user_id, subject_key)
  WHERE retired_at IS NULL;

CREATE INDEX personal_model_items_owner_subject_generation_idx
  ON personal_model_items (user_id, subject_key, generation DESC);

CREATE FUNCTION enforce_personal_model_item_generation_insert()
RETURNS TRIGGER AS $$
DECLARE
  predecessor_generation INTEGER;
  predecessor_retired_at TIMESTAMPTZ;
  predecessor_status TEXT;
BEGIN
  IF NEW.current_revision <> 1 OR NEW.updated_at <> NEW.created_at THEN
    RAISE EXCEPTION 'personal model generation must start at revision one';
  END IF;

  IF NEW.generation = 1 THEN
    IF EXISTS (
      SELECT 1
      FROM personal_model_items
      WHERE user_id = NEW.user_id AND subject_key = NEW.subject_key
    ) THEN
      RAISE EXCEPTION 'first personal model generation requires an empty subject lineage';
    END IF;
    RETURN NEW;
  END IF;

  SELECT
    predecessor.generation,
    predecessor.retired_at,
    revision.snapshot ->> 'status'
  INTO predecessor_generation, predecessor_retired_at, predecessor_status
  FROM personal_model_items AS predecessor
  JOIN personal_model_item_revisions AS revision
    ON revision.user_id = predecessor.user_id
   AND revision.item_id = predecessor.id
   AND revision.revision = predecessor.current_revision
  WHERE predecessor.user_id = NEW.user_id
    AND predecessor.id = NEW.predecessor_item_id
    AND predecessor.subject_key = NEW.subject_key;

  IF predecessor_generation IS NULL
    OR predecessor_generation + 1 <> NEW.generation
    OR predecessor_retired_at IS NULL
    OR predecessor_retired_at <> NEW.created_at
    OR predecessor_status NOT IN ('superseded', 'invalidated') THEN
    RAISE EXCEPTION 'personal model successor must follow one retired terminal generation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER personal_model_items_generation_insert_guard
  BEFORE INSERT ON personal_model_items
  FOR EACH ROW EXECUTE FUNCTION enforce_personal_model_item_generation_insert();

CREATE OR REPLACE FUNCTION guard_personal_model_item_mutation()
RETURNS TRIGGER AS $$
DECLARE
  current_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() <= 1 THEN
      RAISE EXCEPTION 'personal model items may only be deleted by owner cascade';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.id <> OLD.id
    OR NEW.user_id <> OLD.user_id
    OR NEW.subject_key <> OLD.subject_key
    OR NEW.generation <> OLD.generation
    OR NEW.predecessor_item_id IS DISTINCT FROM OLD.predecessor_item_id
    OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'personal model item identity is immutable';
  END IF;

  IF OLD.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'retired personal model generations are immutable';
  END IF;

  IF NEW.retired_at IS NOT NULL THEN
    SELECT snapshot ->> 'status'
    INTO current_status
    FROM personal_model_item_revisions
    WHERE user_id = OLD.user_id
      AND item_id = OLD.id
      AND revision = OLD.current_revision;

    IF NEW.current_revision <> OLD.current_revision
      OR NEW.retired_at <> NEW.updated_at
      OR NEW.retired_at < OLD.updated_at
      OR current_status NOT IN ('superseded', 'invalidated')
      OR EXISTS (
        SELECT 1
        FROM personal_model_source_refresh_requests AS request
        LEFT JOIN personal_model_source_refresh_resolutions AS resolution
          ON resolution.request_id = request.id
        WHERE request.user_id = OLD.user_id
          AND request.item_id = OLD.id
          AND resolution.request_id IS NULL
      ) THEN
      RAISE EXCEPTION 'personal model generation retirement requires a terminal settled item';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.current_revision <> OLD.current_revision + 1 THEN
    RAISE EXCEPTION 'personal model current revision must advance by exactly one';
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'personal model item update time cannot move backward';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_personal_model_retirement_has_successor()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.retired_at IS NULL
    AND NEW.retired_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM personal_model_items AS successor
      WHERE successor.user_id = NEW.user_id
        AND successor.subject_key = NEW.subject_key
        AND successor.predecessor_item_id = NEW.id
        AND successor.generation = NEW.generation + 1
        AND successor.created_at = NEW.retired_at
    ) THEN
    RAISE EXCEPTION 'retired personal model generation requires an atomic successor';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER personal_model_items_retirement_successor_guard
  AFTER UPDATE ON personal_model_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_personal_model_retirement_has_successor();

CREATE FUNCTION reject_personal_model_feedback_for_retired_generation()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM personal_model_items
    WHERE user_id = NEW.user_id
      AND id = NEW.item_id
      AND retired_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'retired personal model generations cannot accept feedback';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER personal_model_feedback_events_generation_guard
  BEFORE INSERT ON personal_model_feedback_events
  FOR EACH ROW EXECUTE FUNCTION reject_personal_model_feedback_for_retired_generation();

CREATE OR REPLACE FUNCTION enqueue_personal_model_source_refresh()
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
    refresh_reason := CASE
      WHEN NEW.action = 'deleted' THEN 'source_deleted'
      ELSE 'source_corrected'
    END;
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
   AND item.retired_at IS NULL
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
