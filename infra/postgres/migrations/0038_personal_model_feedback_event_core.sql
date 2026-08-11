CREATE TABLE personal_model_feedback_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  item_id UUID NOT NULL,
  item_revision INTEGER NOT NULL CHECK (item_revision > 0),
  choice TEXT NOT NULL CHECK (choice IN (
    'matches_me',
    'temporary_context',
    'disagree',
    'uncertain'
  )),
  reason_code TEXT CHECK (reason_code IN (
    'evidence_missing',
    'context_changed',
    'not_representative',
    'source_incorrect',
    'prefer_not_to_answer',
    'other'
  )),
  note TEXT CHECK (
    note IS NULL OR (
      note = BTRIM(note)
      AND CHAR_LENGTH(note) BETWEEN 1 AND 300
    )
  ),
  context_valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  transition_schema_version TEXT NOT NULL CHECK (
    transition_schema_version = 'personal-model-feedback-transition-v1'
  ),
  outcome TEXT NOT NULL CHECK (outcome IN ('revised', 'no_op')),
  no_op_reason TEXT CHECK (no_op_reason = 'feedback_already_current'),
  result_revision INTEGER CHECK (result_revision > 0),
  result_fingerprint CHAR(64) NOT NULL CHECK (
    result_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  revision_action TEXT GENERATED ALWAYS AS (
    CASE choice
      WHEN 'matches_me' THEN 'user_confirmed'
      WHEN 'temporary_context' THEN 'user_marked_temporary'
      WHEN 'disagree' THEN 'user_disagreed'
      WHEN 'uncertain' THEN 'user_uncertain'
    END
  ) STORED,
  CONSTRAINT personal_model_feedback_events_context_check CHECK (
    (
      choice = 'temporary_context'
      AND context_valid_until IS NOT NULL
      AND context_valid_until > created_at
    )
    OR
    (choice <> 'temporary_context' AND context_valid_until IS NULL)
  ),
  CONSTRAINT personal_model_feedback_events_outcome_relation_check CHECK (
    (
      outcome = 'revised'
      AND result_revision = item_revision + 1
      AND no_op_reason IS NULL
    )
    OR
    (
      outcome = 'no_op'
      AND result_revision IS NULL
      AND no_op_reason = 'feedback_already_current'
    )
  ),
  CONSTRAINT personal_model_feedback_events_target_revision_fk
    FOREIGN KEY (user_id, item_id, item_revision)
    REFERENCES personal_model_item_revisions(user_id, item_id, revision)
    ON DELETE CASCADE,
  CONSTRAINT personal_model_feedback_events_result_revision_fk
    FOREIGN KEY (user_id, item_id, result_revision)
    REFERENCES personal_model_item_revisions(user_id, item_id, revision)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT personal_model_feedback_events_result_revision_unique
    UNIQUE (user_id, item_id, result_revision),
  CONSTRAINT personal_model_feedback_events_revision_relation_unique
    UNIQUE (
      id,
      user_id,
      item_id,
      item_revision,
      revision_action,
      result_revision,
      result_fingerprint
    )
);

ALTER TABLE personal_model_item_revisions
  DROP CONSTRAINT personal_model_item_revisions_feedback_persistence_pending_check;

ALTER TABLE personal_model_item_revisions
  ADD CONSTRAINT personal_model_item_revisions_feedback_event_unique
  UNIQUE (feedback_event_id);

ALTER TABLE personal_model_item_revisions
  ADD CONSTRAINT personal_model_item_revisions_feedback_event_fk
  FOREIGN KEY (
    feedback_event_id,
    user_id,
    item_id,
    previous_revision,
    action,
    revision,
    derivation_fingerprint
  )
  REFERENCES personal_model_feedback_events (
    id,
    user_id,
    item_id,
    item_revision,
    revision_action,
    result_revision,
    result_fingerprint
  )
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX personal_model_feedback_events_owner_item_created_idx
  ON personal_model_feedback_events (user_id, item_id, created_at DESC, id DESC);

CREATE FUNCTION enforce_personal_model_feedback_target()
RETURNS TRIGGER AS $$
DECLARE
  item_current_revision INTEGER;
  target_changed_at TIMESTAMPTZ;
  target_snapshot JSONB;
  expected_feedback_state TEXT;
BEGIN
  SELECT item.current_revision, revision.changed_at, revision.snapshot
  INTO item_current_revision, target_changed_at, target_snapshot
  FROM personal_model_items AS item
  JOIN personal_model_item_revisions AS revision
    ON revision.user_id = item.user_id
   AND revision.item_id = item.id
   AND revision.revision = NEW.item_revision
  WHERE item.user_id = NEW.user_id AND item.id = NEW.item_id;

  IF item_current_revision IS NULL OR item_current_revision <> NEW.item_revision THEN
    RAISE EXCEPTION 'personal model feedback must target the current revision';
  END IF;

  IF NEW.created_at < target_changed_at THEN
    RAISE EXCEPTION 'personal model feedback cannot predate its target revision';
  END IF;

  IF target_snapshot ->> 'status' IN ('superseded', 'invalidated') THEN
    RAISE EXCEPTION 'terminal personal model items cannot accept feedback';
  END IF;

  IF NEW.outcome = 'no_op' THEN
    expected_feedback_state := CASE NEW.choice
      WHEN 'matches_me' THEN 'confirmed'
      WHEN 'temporary_context' THEN 'temporary'
      WHEN 'disagree' THEN 'disagreed'
      WHEN 'uncertain' THEN 'uncertain'
    END;

    IF target_snapshot ->> 'feedbackState' <> expected_feedback_state THEN
      RAISE EXCEPTION 'personal model feedback no-op must already be current';
    END IF;

    IF NEW.choice = 'disagree' AND target_snapshot ->> 'status' <> 'disputed' THEN
      RAISE EXCEPTION 'personal model disagreement no-op requires a disputed item';
    END IF;

    IF NEW.choice = 'temporary_context'
      AND (target_snapshot ->> 'validTo')::TIMESTAMPTZ IS DISTINCT FROM NEW.context_valid_until THEN
      RAISE EXCEPTION 'personal model temporary no-op validity must match';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER personal_model_feedback_events_target_guard
  BEFORE INSERT ON personal_model_feedback_events
  FOR EACH ROW EXECUTE FUNCTION enforce_personal_model_feedback_target();

CREATE FUNCTION reject_personal_model_feedback_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'personal model feedback events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER personal_model_feedback_events_immutable
  BEFORE UPDATE OR DELETE ON personal_model_feedback_events
  FOR EACH ROW EXECUTE FUNCTION reject_personal_model_feedback_event_mutation();
