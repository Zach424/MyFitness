CREATE OR REPLACE FUNCTION enforce_personal_model_item_generation_insert()
RETURNS TRIGGER AS $$
DECLARE
  predecessor_generation INTEGER;
  predecessor_retired_at TIMESTAMPTZ;
  predecessor_status TEXT;
BEGIN
  IF NEW.current_revision <> 1
    OR NEW.updated_at <> NEW.created_at
    OR NEW.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'personal model generation must start at revision one and remain current';
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
      OR NEW.retired_at <= OLD.updated_at
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
