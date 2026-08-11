CREATE TABLE personal_model_items (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_key TEXT NOT NULL CHECK (subject_key IN (
    'training.availability',
    'training.recorded_frequency',
    'training.recorded_session_duration'
  )),
  current_revision INTEGER NOT NULL CHECK (current_revision > 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT personal_model_items_update_time_check CHECK (updated_at >= created_at),
  CONSTRAINT personal_model_items_owner_identity_unique UNIQUE (user_id, id),
  CONSTRAINT personal_model_items_owner_subject_unique UNIQUE (user_id, subject_key),
  CONSTRAINT personal_model_items_owner_identity_subject_unique
    UNIQUE (user_id, id, subject_key)
);

CREATE TABLE personal_model_item_revisions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  item_id UUID NOT NULL,
  subject_key TEXT NOT NULL,
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'personal-model-item-revision-v1'
  ),
  revision INTEGER NOT NULL CHECK (revision > 0),
  previous_revision INTEGER CHECK (previous_revision > 0),
  action TEXT NOT NULL CHECK (action IN (
    'created',
    'evidence_accumulated',
    'evidence_contradicted',
    'user_confirmed',
    'user_marked_temporary',
    'user_disagreed',
    'user_uncertain',
    'superseded',
    'invalidated'
  )),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  derivation_fingerprint CHAR(64) NOT NULL CHECK (
    derivation_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  feedback_event_id UUID,
  changed_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT personal_model_item_revisions_owner_item_subject_fk
    FOREIGN KEY (user_id, item_id, subject_key)
    REFERENCES personal_model_items(user_id, id, subject_key)
    ON DELETE CASCADE,
  CONSTRAINT personal_model_item_revisions_owner_item_revision_unique
    UNIQUE (user_id, item_id, revision),
  CONSTRAINT personal_model_item_revisions_snapshot_required_keys_check CHECK (
    snapshot ?& ARRAY[
      'contractVersion', 'id', 'userId', 'kind', 'subjectKey',
      'claimSchemaVersion', 'claim', 'source', 'status', 'confidence',
      'evidenceSet', 'validFrom', 'validTo', 'observedFrom',
      'observedThrough', 'derivedAt', 'revision', 'feedbackState',
      'createdAt', 'updatedAt'
    ]::TEXT[]
  ),
  CONSTRAINT personal_model_item_revisions_snapshot_identity_check CHECK (
    snapshot ->> 'contractVersion' = 'personal-model-contract-v1'
    AND (snapshot ->> 'id')::UUID = item_id
    AND (snapshot ->> 'userId')::UUID = user_id
    AND snapshot ->> 'subjectKey' = subject_key
    AND jsonb_typeof(snapshot -> 'revision') = 'number'
    AND (snapshot ->> 'revision')::INTEGER = revision
    AND (snapshot ->> 'updatedAt')::TIMESTAMPTZ = changed_at
  ),
  CONSTRAINT personal_model_item_revisions_snapshot_domain_check CHECK (
    snapshot ->> 'kind' IN (
      'goal', 'constraint', 'preference', 'baseline',
      'behavior', 'state', 'pattern', 'hypothesis'
    )
    AND snapshot ->> 'status' IN (
      'candidate', 'active', 'disputed', 'superseded', 'invalidated'
    )
    AND snapshot ->> 'source' IN (
      'user_confirmed', 'deterministic_rule', 'model_candidate'
    )
    AND snapshot ->> 'claimSchemaVersion' IN (
      'training_availability_constraint_v1',
      'recorded_training_frequency_behavior_v1',
      'recorded_session_duration_baseline_v1'
    )
    AND snapshot ->> 'feedbackState' IN (
      'unreviewed', 'confirmed', 'temporary', 'disagreed', 'uncertain'
    )
    AND jsonb_typeof(snapshot -> 'claim') = 'object'
    AND jsonb_typeof(snapshot -> 'confidence') = 'object'
    AND jsonb_typeof(snapshot -> 'evidenceSet') = 'object'
  ),
  CONSTRAINT personal_model_item_revisions_chain_check CHECK (
    (action = 'created' AND revision = 1 AND previous_revision IS NULL)
    OR
    (action <> 'created' AND revision > 1 AND previous_revision = revision - 1)
  ),
  CONSTRAINT personal_model_item_revisions_feedback_reference_check CHECK (
    (action IN (
      'user_confirmed', 'user_marked_temporary', 'user_disagreed', 'user_uncertain'
    )) = (feedback_event_id IS NOT NULL)
  ),
  CONSTRAINT personal_model_item_revisions_feedback_persistence_pending_check CHECK (
    feedback_event_id IS NULL
    AND action NOT IN (
      'user_confirmed', 'user_marked_temporary', 'user_disagreed', 'user_uncertain'
    )
  ),
  CONSTRAINT personal_model_item_revisions_action_snapshot_check CHECK (
    (action <> 'user_confirmed' OR snapshot ->> 'feedbackState' = 'confirmed')
    AND (action <> 'user_marked_temporary' OR snapshot ->> 'feedbackState' = 'temporary')
    AND (action <> 'user_disagreed' OR (
      snapshot ->> 'feedbackState' = 'disagreed'
      AND snapshot ->> 'status' = 'disputed'
    ))
    AND (action <> 'user_uncertain' OR snapshot ->> 'feedbackState' = 'uncertain')
    AND (action <> 'superseded' OR snapshot ->> 'status' = 'superseded')
    AND (action <> 'invalidated' OR snapshot ->> 'status' = 'invalidated')
  ),
  CONSTRAINT personal_model_item_revisions_previous_fk
    FOREIGN KEY (user_id, item_id, previous_revision)
    REFERENCES personal_model_item_revisions(user_id, item_id, revision)
    DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE personal_model_items
  ADD CONSTRAINT personal_model_items_current_revision_fk
  FOREIGN KEY (user_id, id, current_revision)
  REFERENCES personal_model_item_revisions(user_id, item_id, revision)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX personal_model_item_revisions_owner_item_history_idx
  ON personal_model_item_revisions (user_id, item_id, revision DESC);

CREATE FUNCTION guard_personal_model_item_mutation()
RETURNS TRIGGER AS $$
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
    OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'personal model item identity is immutable';
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

CREATE TRIGGER personal_model_items_mutation_guard
  BEFORE UPDATE OR DELETE ON personal_model_items
  FOR EACH ROW EXECUTE FUNCTION guard_personal_model_item_mutation();

CREATE FUNCTION reject_personal_model_item_revision_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'personal model item revisions are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER personal_model_item_revisions_immutable
  BEFORE UPDATE OR DELETE ON personal_model_item_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_personal_model_item_revision_mutation();

CREATE FUNCTION enforce_personal_model_revision_is_current()
RETURNS TRIGGER AS $$
DECLARE
  item_current_revision INTEGER;
BEGIN
  SELECT current_revision
  INTO item_current_revision
  FROM personal_model_items
  WHERE user_id = NEW.user_id AND id = NEW.item_id;

  IF item_current_revision IS NULL OR item_current_revision < NEW.revision THEN
    RAISE EXCEPTION 'personal model revision was not atomically published as current';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER personal_model_item_revisions_current_guard
  AFTER INSERT ON personal_model_item_revisions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_personal_model_revision_is_current();
