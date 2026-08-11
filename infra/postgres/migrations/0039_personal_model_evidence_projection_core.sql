CREATE TABLE personal_model_evidence_refs (
  user_id UUID NOT NULL,
  item_id UUID NOT NULL,
  item_revision INTEGER NOT NULL CHECK (item_revision > 0),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 800),
  reference_id UUID NOT NULL,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN (
    'onboarding_goal_revision',
    'workout_revision'
  )),
  aggregate_id UUID NOT NULL,
  aggregate_revision INTEGER NOT NULL CHECK (aggregate_revision > 0),
  role TEXT NOT NULL CHECK (role IN ('supporting', 'contradicting', 'context')),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('user_confirmed', 'manual', 'imported')),
  qualification TEXT NOT NULL CHECK (qualification IN ('eligible', 'withdrawn')),
  withdrawn_reason TEXT CHECK (withdrawn_reason IN (
    'source_corrected',
    'source_deleted',
    'link_removed',
    'policy_changed'
  )),
  reference JSONB NOT NULL CHECK (jsonb_typeof(reference) = 'object'),
  CONSTRAINT personal_model_evidence_refs_revision_fk
    FOREIGN KEY (user_id, item_id, item_revision)
    REFERENCES personal_model_item_revisions(user_id, item_id, revision)
    ON DELETE CASCADE,
  CONSTRAINT personal_model_evidence_refs_revision_ordinal_unique
    UNIQUE (user_id, item_id, item_revision, ordinal),
  CONSTRAINT personal_model_evidence_refs_revision_reference_unique
    UNIQUE (user_id, item_id, item_revision, reference_id),
  CONSTRAINT personal_model_evidence_refs_revision_aggregate_unique
    UNIQUE (
      user_id,
      item_id,
      item_revision,
      evidence_kind,
      aggregate_id,
      aggregate_revision
    ),
  CONSTRAINT personal_model_evidence_refs_required_keys_check CHECK (
    reference ?& ARRAY[
      'id', 'ownerUserId', 'role', 'evidenceKind', 'aggregateId',
      'aggregateRevision', 'sourceKind', 'qualification',
      'withdrawnReason', 'time'
    ]::TEXT[]
    AND jsonb_typeof(reference -> 'time') = 'object'
  ),
  CONSTRAINT personal_model_evidence_refs_identity_check CHECK (
    (reference ->> 'id')::UUID = reference_id
    AND (reference ->> 'ownerUserId')::UUID = user_id
    AND reference ->> 'role' = role
    AND reference ->> 'evidenceKind' = evidence_kind
    AND (reference ->> 'aggregateId')::UUID = aggregate_id
    AND (reference ->> 'aggregateRevision')::INTEGER = aggregate_revision
    AND reference ->> 'sourceKind' = source_kind
    AND reference ->> 'qualification' = qualification
    AND (
      (withdrawn_reason IS NULL AND reference -> 'withdrawnReason' = 'null'::JSONB)
      OR reference ->> 'withdrawnReason' = withdrawn_reason
    )
  ),
  CONSTRAINT personal_model_evidence_refs_source_compatibility_check CHECK (
    (evidence_kind = 'onboarding_goal_revision' AND source_kind = 'user_confirmed')
    OR
    (evidence_kind = 'workout_revision' AND source_kind IN ('manual', 'imported'))
  ),
  CONSTRAINT personal_model_evidence_refs_qualification_relation_check CHECK (
    (
      qualification = 'eligible'
      AND withdrawn_reason IS NULL
    )
    OR
    (
      qualification = 'withdrawn'
      AND withdrawn_reason IS NOT NULL
      AND role = 'context'
    )
  ),
  CONSTRAINT personal_model_evidence_refs_time_shape_check CHECK (
    (
      evidence_kind = 'onboarding_goal_revision'
      AND reference #>> '{time,kind}' = 'instant'
      AND reference #>> '{time,occurredAt}' IS NOT NULL
      AND (reference #>> '{time,occurredAt}')::TIMESTAMPTZ IS NOT NULL
    )
    OR
    (
      evidence_kind = 'workout_revision'
      AND reference #>> '{time,kind}' = 'interval'
      AND reference #>> '{time,startedAt}' IS NOT NULL
      AND reference #>> '{time,endedAt}' IS NOT NULL
      AND CHAR_LENGTH(reference #>> '{time,timezone}') BETWEEN 1 AND 64
      AND (reference #>> '{time,endedAt}')::TIMESTAMPTZ >=
        (reference #>> '{time,startedAt}')::TIMESTAMPTZ
    )
  )
);

CREATE INDEX personal_model_evidence_refs_owner_item_revision_idx
  ON personal_model_evidence_refs (user_id, item_id, item_revision, ordinal);

CREATE INDEX personal_model_evidence_refs_owner_aggregate_idx
  ON personal_model_evidence_refs (
    user_id,
    evidence_kind,
    aggregate_id,
    aggregate_revision,
    item_id,
    item_revision
  );

INSERT INTO personal_model_evidence_refs (
  user_id,
  item_id,
  item_revision,
  ordinal,
  reference_id,
  evidence_kind,
  aggregate_id,
  aggregate_revision,
  role,
  source_kind,
  qualification,
  withdrawn_reason,
  reference
)
SELECT
  revision.user_id,
  revision.item_id,
  revision.revision,
  evidence.ordinality::INTEGER,
  (evidence.reference ->> 'id')::UUID,
  evidence.reference ->> 'evidenceKind',
  (evidence.reference ->> 'aggregateId')::UUID,
  (evidence.reference ->> 'aggregateRevision')::INTEGER,
  evidence.reference ->> 'role',
  evidence.reference ->> 'sourceKind',
  evidence.reference ->> 'qualification',
  evidence.reference ->> 'withdrawnReason',
  evidence.reference
FROM personal_model_item_revisions AS revision
CROSS JOIN LATERAL jsonb_array_elements(
  revision.snapshot #> '{evidenceSet,references}'
) WITH ORDINALITY AS evidence(reference, ordinality);

CREATE FUNCTION enforce_personal_model_evidence_projection()
RETURNS TRIGGER AS $$
DECLARE
  projection_user_id UUID;
  projection_item_id UUID;
  projection_item_revision INTEGER;
  revision_snapshot JSONB;
  snapshot_references JSONB;
  projected_references JSONB;
  projected_count BIGINT;
  eligible_count BIGINT;
  supporting_count BIGINT;
  contradicting_count BIGINT;
  withdrawn_count BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'personal_model_item_revisions' THEN
    projection_user_id := NEW.user_id;
    projection_item_id := NEW.item_id;
    projection_item_revision := NEW.revision;
    revision_snapshot := NEW.snapshot;
  ELSE
    projection_user_id := NEW.user_id;
    projection_item_id := NEW.item_id;
    projection_item_revision := NEW.item_revision;

    SELECT snapshot
    INTO revision_snapshot
    FROM personal_model_item_revisions
    WHERE user_id = projection_user_id
      AND item_id = projection_item_id
      AND revision = projection_item_revision;
  END IF;

  IF revision_snapshot IS NULL THEN
    RAISE EXCEPTION 'personal model evidence projection revision is missing';
  END IF;

  snapshot_references := revision_snapshot #> '{evidenceSet,references}';
  IF jsonb_typeof(snapshot_references) IS DISTINCT FROM 'array'
    OR jsonb_array_length(snapshot_references) NOT BETWEEN 1 AND 800 THEN
    RAISE EXCEPTION 'personal model evidence snapshot references are invalid';
  END IF;

  IF (revision_snapshot #>> '{evidenceSet,ownerUserId}')::UUID
      IS DISTINCT FROM projection_user_id
    OR COALESCE(revision_snapshot #>> '{evidenceSet,evidenceFingerprint}', '')
      !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'personal model evidence snapshot identity is invalid';
  END IF;

  SELECT
    COALESCE(jsonb_agg(reference ORDER BY ordinal), '[]'::JSONB),
    COUNT(*),
    COUNT(*) FILTER (WHERE qualification = 'eligible'),
    COUNT(*) FILTER (WHERE qualification = 'eligible' AND role = 'supporting'),
    COUNT(*) FILTER (WHERE qualification = 'eligible' AND role = 'contradicting'),
    COUNT(*) FILTER (WHERE qualification = 'withdrawn')
  INTO
    projected_references,
    projected_count,
    eligible_count,
    supporting_count,
    contradicting_count,
    withdrawn_count
  FROM personal_model_evidence_refs
  WHERE user_id = projection_user_id
    AND item_id = projection_item_id
    AND item_revision = projection_item_revision;

  IF projected_count <> jsonb_array_length(snapshot_references)
    OR projected_references IS DISTINCT FROM snapshot_references
    OR eligible_count <> (revision_snapshot #>> '{evidenceSet,includedCount}')::INTEGER
    OR supporting_count <> (revision_snapshot #>> '{evidenceSet,supportingCount}')::INTEGER
    OR contradicting_count <> (revision_snapshot #>> '{evidenceSet,contradictingCount}')::INTEGER
    OR withdrawn_count <> (revision_snapshot #>> '{evidenceSet,withdrawnCount}')::INTEGER THEN
    RAISE EXCEPTION 'personal model evidence projection does not match revision snapshot';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER personal_model_item_revisions_evidence_projection_guard
  AFTER INSERT ON personal_model_item_revisions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_personal_model_evidence_projection();

CREATE CONSTRAINT TRIGGER personal_model_evidence_refs_projection_guard
  AFTER INSERT ON personal_model_evidence_refs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_personal_model_evidence_projection();

CREATE FUNCTION reject_personal_model_evidence_ref_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'personal model evidence references are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER personal_model_evidence_refs_immutable
  BEFORE UPDATE OR DELETE ON personal_model_evidence_refs
  FOR EACH ROW EXECUTE FUNCTION reject_personal_model_evidence_ref_mutation();
