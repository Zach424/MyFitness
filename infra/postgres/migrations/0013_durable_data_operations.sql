ALTER TABLE privacy_erasure_receipts
  DROP CONSTRAINT privacy_erasure_receipts_scope_version_check;

ALTER TABLE privacy_erasure_receipts
  ALTER COLUMN completed_at DROP NOT NULL,
  ALTER COLUMN completed_at DROP DEFAULT,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'completed' CHECK (
    status IN ('queued', 'running', 'completed', 'dead_letter')
  ),
  ADD COLUMN status_token_hash CHAR(64),
  ADD COLUMN requested_user_id UUID,
  ADD COLUMN subject_ref CHAR(64),
  ADD COLUMN primary_store_status TEXT NOT NULL DEFAULT 'deleted' CHECK (
    primary_store_status IN ('pending', 'deleted')
  ),
  ADD COLUMN media_status TEXT NOT NULL DEFAULT 'legacy_untracked' CHECK (
    media_status IN ('pending', 'deleted', 'legacy_untracked')
  ),
  ADD COLUMN provider_status TEXT NOT NULL DEFAULT 'legacy_untracked' CHECK (
    provider_status IN ('pending', 'not_applicable', 'fixture_only', 'policy_bound', 'legacy_untracked')
  ),
  ADD COLUMN backup_status TEXT NOT NULL DEFAULT 'legacy_untracked' CHECK (
    backup_status IN ('pending', 'ledger_published', 'legacy_untracked')
  ),
  ADD COLUMN requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN last_error_code TEXT CHECK (
    last_error_code IS NULL OR last_error_code IN (
      'object_storage_unavailable', 'database_unavailable', 'invalid_job_payload', 'unexpected_error'
    )
  );

ALTER TABLE privacy_erasure_receipts
  ADD CONSTRAINT privacy_erasure_receipts_scope_version_check
  CHECK (scope_version IN ('primary-store-v1', 'durable-erasure-v2')),
  ADD CONSTRAINT privacy_erasure_receipts_lifecycle_check
  CHECK (
    (scope_version = 'primary-store-v1'
      AND status = 'completed'
      AND completed_at IS NOT NULL)
    OR
    (scope_version = 'durable-erasure-v2'
      AND status_token_hash IS NOT NULL
      AND subject_ref IS NOT NULL
      AND (
        (status IN ('queued', 'running', 'dead_letter')
          AND requested_user_id IS NOT NULL
          AND completed_at IS NULL
          AND primary_store_status = 'pending')
        OR
        (status = 'completed'
          AND requested_user_id IS NULL
          AND completed_at IS NOT NULL
          AND primary_store_status = 'deleted'
          AND media_status = 'deleted'
          AND backup_status = 'ledger_published')
      ))
  );

CREATE UNIQUE INDEX privacy_erasure_receipts_status_token_idx
  ON privacy_erasure_receipts (status_token_hash)
  WHERE status_token_hash IS NOT NULL;

ALTER TABLE nutrition_photo_candidates
  ADD COLUMN media_deletion_status TEXT NOT NULL DEFAULT 'not_required' CHECK (
    media_deletion_status IN ('not_required', 'pending', 'deleted')
  );

UPDATE nutrition_photo_candidates
SET media_deletion_status = 'deleted'
WHERE status IN ('failed', 'rejected', 'confirmed', 'deleted', 'expired');

CREATE TABLE data_operation_jobs (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL CHECK (
    kind IN ('photo_object_delete', 'photo_prefix_delete', 'account_erasure')
  ),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'running', 'retry_wait', 'succeeded', 'dead_letter')
  ),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  receipt_id UUID REFERENCES privacy_erasure_receipts(receipt_id) ON DELETE SET NULL,
  dedupe_key TEXT NOT NULL UNIQUE CHECK (char_length(dedupe_key) BETWEEN 8 AND 240),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 20),
  max_attempts INTEGER NOT NULL DEFAULT 12 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  last_error_code TEXT CHECK (
    last_error_code IS NULL OR last_error_code IN (
      'object_storage_unavailable', 'database_unavailable', 'invalid_job_payload', 'unexpected_error'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK (
    (status = 'succeeded' AND completed_at IS NOT NULL AND payload = '{}'::JSONB)
    OR (status <> 'succeeded' AND completed_at IS NULL)
  )
);

CREATE INDEX data_operation_jobs_claim_idx
  ON data_operation_jobs (available_at, created_at)
  WHERE status IN ('queued', 'retry_wait', 'running');

CREATE INDEX data_operation_jobs_receipt_idx
  ON data_operation_jobs (receipt_id)
  WHERE receipt_id IS NOT NULL;

CREATE TABLE data_operation_attempts (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES data_operation_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number BETWEEN 1 AND 20),
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'retry_scheduled', 'dead_lettered')),
  error_code TEXT CHECK (
    error_code IS NULL OR error_code IN (
      'object_storage_unavailable', 'database_unavailable', 'invalid_job_payload', 'unexpected_error'
    )
  ),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, attempt_number)
);

CREATE INDEX data_operation_attempts_completed_idx
  ON data_operation_attempts (completed_at DESC);
