CREATE TABLE privacy_export_archives (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  idempotency_key UUID NOT NULL,
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  export_schema_version TEXT NOT NULL CHECK (
    export_schema_version = 'myfitness-portable-export-v4'
  ),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'generating', 'available', 'failed', 'deletion_pending', 'disposed')
  ),
  object_key TEXT CHECK (
    object_key IS NULL OR object_key =
      user_id::TEXT || '/' || id::TEXT || '.json.enc'
  ),
  encryption_key_ref TEXT CHECK (
    encryption_key_ref IS NULL OR (
      char_length(encryption_key_ref) BETWEEN 3 AND 240
      AND encryption_key_ref ~ '^[A-Za-z0-9][A-Za-z0-9/_.:@-]+$'
    )
  ),
  artifact_sha256 CHAR(64) CHECK (
    artifact_sha256 IS NULL OR artifact_sha256 ~ '^[0-9a-f]{64}$'
  ),
  artifact_byte_size BIGINT CHECK (artifact_byte_size IS NULL OR artifact_byte_size > 0),
  generation_expires_at TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ,
  download_expires_at TIMESTAMPTZ,
  failure_code TEXT CHECK (
    failure_code IS NULL OR failure_code IN (
      'generation_expired', 'archive_size_limit_exceeded', 'object_storage_unavailable',
      'database_unavailable', 'invalid_archive_state', 'unexpected_error'
    )
  ),
  disposition_reason TEXT CHECK (
    disposition_reason IS NULL OR disposition_reason IN (
      'retention_expired', 'account_erasure', 'user_requested'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disposed_at TIMESTAMPTZ,
  UNIQUE (user_id, idempotency_key),
  CHECK (generation_expires_at > created_at),
  CHECK (updated_at >= created_at),
  CHECK ((artifact_sha256 IS NULL) = (artifact_byte_size IS NULL)),
  CHECK ((artifact_sha256 IS NULL) = (available_at IS NULL)),
  CHECK ((artifact_sha256 IS NULL) = (download_expires_at IS NULL)),
  CHECK (available_at IS NULL OR (
    available_at <= generation_expires_at AND available_at <= updated_at
  )),
  CHECK (download_expires_at IS NULL OR download_expires_at > available_at),
  CHECK (disposed_at IS NULL OR (
    disposed_at >= COALESCE(available_at, created_at) AND disposed_at <= updated_at
  )),
  CONSTRAINT privacy_export_archives_lifecycle_check CHECK (
    (status = 'queued'
      AND object_key IS NOT NULL
      AND encryption_key_ref IS NULL
      AND artifact_sha256 IS NULL
      AND failure_code IS NULL
      AND disposition_reason IS NULL
      AND disposed_at IS NULL)
    OR
    (status = 'generating'
      AND object_key IS NOT NULL
      AND encryption_key_ref IS NOT NULL
      AND artifact_sha256 IS NULL
      AND failure_code IS NULL
      AND disposition_reason IS NULL
      AND disposed_at IS NULL)
    OR
    (status = 'available'
      AND object_key IS NOT NULL
      AND encryption_key_ref IS NOT NULL
      AND artifact_sha256 IS NOT NULL
      AND failure_code IS NULL
      AND disposition_reason IS NULL
      AND disposed_at IS NULL)
    OR
    (status = 'failed'
      AND object_key IS NULL
      AND encryption_key_ref IS NULL
      AND artifact_sha256 IS NULL
      AND failure_code IS NOT NULL
      AND disposition_reason IS NULL
      AND disposed_at IS NULL)
    OR
    (status = 'deletion_pending'
      AND object_key IS NOT NULL
      AND failure_code IS NULL
      AND disposition_reason IS NOT NULL
      AND disposed_at IS NULL
      AND (artifact_sha256 IS NULL OR encryption_key_ref IS NOT NULL))
    OR
    (status = 'disposed'
      AND object_key IS NULL
      AND encryption_key_ref IS NULL
      AND failure_code IS NULL
      AND disposition_reason IS NOT NULL
      AND disposed_at IS NOT NULL)
  )
);

CREATE INDEX privacy_export_archives_owner_id_idx
  ON privacy_export_archives (user_id, id);

CREATE INDEX privacy_export_archives_owner_requested_idx
  ON privacy_export_archives (user_id, created_at DESC, id DESC);

CREATE INDEX privacy_export_archives_generation_expiry_idx
  ON privacy_export_archives (generation_expires_at, created_at)
  WHERE status IN ('queued', 'generating');

CREATE INDEX privacy_export_archives_retention_expiry_idx
  ON privacy_export_archives (download_expires_at, available_at)
  WHERE status = 'available';

CREATE INDEX privacy_export_archives_deletion_idx
  ON privacy_export_archives (updated_at, created_at)
  WHERE status = 'deletion_pending';

CREATE FUNCTION enforce_privacy_export_archive_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id <> OLD.id
    OR NEW.user_id <> OLD.user_id
    OR NEW.idempotency_key <> OLD.idempotency_key
    OR NEW.request_hash <> OLD.request_hash
    OR NEW.export_schema_version <> OLD.export_schema_version
    OR NEW.generation_expires_at <> OLD.generation_expires_at THEN
    RAISE EXCEPTION 'portable export archive identity is immutable';
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'portable export archive update time cannot move backward';
  END IF;

  IF NEW.status = OLD.status THEN
    IF ROW(
      NEW.object_key, NEW.encryption_key_ref, NEW.artifact_sha256,
      NEW.artifact_byte_size, NEW.available_at, NEW.download_expires_at,
      NEW.failure_code, NEW.disposition_reason, NEW.disposed_at
    ) IS DISTINCT FROM ROW(
      OLD.object_key, OLD.encryption_key_ref, OLD.artifact_sha256,
      OLD.artifact_byte_size, OLD.available_at, OLD.download_expires_at,
      OLD.failure_code, OLD.disposition_reason, OLD.disposed_at
    ) THEN
      RAISE EXCEPTION 'portable export archive custody changes require a state transition';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'queued' AND NEW.status IN ('generating', 'failed', 'deletion_pending'))
    OR (OLD.status = 'generating' AND NEW.status IN ('available', 'failed', 'deletion_pending'))
    OR (OLD.status = 'available' AND NEW.status = 'deletion_pending')
    OR (OLD.status = 'deletion_pending' AND NEW.status = 'disposed')
  ) THEN
    RAISE EXCEPTION 'invalid portable export archive transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF NEW.status NOT IN ('failed', 'disposed')
    AND NEW.object_key IS DISTINCT FROM OLD.object_key THEN
    RAISE EXCEPTION 'portable export archive object key changed outside disposal';
  END IF;

  IF NOT (
    (OLD.status = 'queued' AND NEW.status = 'generating')
    OR (OLD.status = 'generating' AND NEW.status = 'failed')
    OR (OLD.status = 'deletion_pending' AND NEW.status = 'disposed')
  ) AND NEW.encryption_key_ref IS DISTINCT FROM OLD.encryption_key_ref THEN
    RAISE EXCEPTION 'portable export archive encryption reference changed outside its boundary';
  END IF;

  IF NOT (OLD.status = 'generating' AND NEW.status = 'available')
    AND ROW(
      NEW.artifact_sha256, NEW.artifact_byte_size,
      NEW.available_at, NEW.download_expires_at
    ) IS DISTINCT FROM ROW(
      OLD.artifact_sha256, OLD.artifact_byte_size,
      OLD.available_at, OLD.download_expires_at
    ) THEN
    RAISE EXCEPTION 'portable export archive artifact receipt changed outside publication';
  END IF;

  IF NEW.status <> 'failed' AND NEW.failure_code IS DISTINCT FROM OLD.failure_code THEN
    RAISE EXCEPTION 'portable export archive failure changed outside failure transition';
  END IF;

  IF NEW.status <> 'deletion_pending'
    AND NEW.disposition_reason IS DISTINCT FROM OLD.disposition_reason THEN
    RAISE EXCEPTION 'portable export archive disposition changed outside deletion transition';
  END IF;

  IF NEW.status <> 'disposed' AND NEW.disposed_at IS DISTINCT FROM OLD.disposed_at THEN
    RAISE EXCEPTION 'portable export archive disposal time changed outside disposal';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER privacy_export_archives_transition_guard
  BEFORE UPDATE ON privacy_export_archives
  FOR EACH ROW EXECUTE FUNCTION enforce_privacy_export_archive_transition();
