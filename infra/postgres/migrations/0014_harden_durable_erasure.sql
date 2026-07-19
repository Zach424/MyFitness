ALTER TABLE privacy_erasure_receipts
  DROP CONSTRAINT privacy_erasure_receipts_lifecycle_check;

UPDATE privacy_erasure_receipts
SET subject_ref = NULL
WHERE scope_version = 'durable-erasure-v2' AND status = 'completed';

ALTER TABLE privacy_erasure_receipts
  ADD CONSTRAINT privacy_erasure_receipts_lifecycle_check
  CHECK (
    (scope_version = 'primary-store-v1'
      AND status = 'completed'
      AND completed_at IS NOT NULL)
    OR
    (scope_version = 'durable-erasure-v2'
      AND status_token_hash IS NOT NULL
      AND (
        (status IN ('queued', 'running', 'dead_letter')
          AND requested_user_id IS NOT NULL
          AND subject_ref IS NOT NULL
          AND completed_at IS NULL
          AND primary_store_status = 'pending')
        OR
        (status = 'completed'
          AND requested_user_id IS NULL
          AND subject_ref IS NULL
          AND completed_at IS NOT NULL
          AND primary_store_status = 'deleted'
          AND media_status = 'deleted'
          AND backup_status = 'ledger_published')
      ))
  );
