CREATE TABLE privacy_erasure_receipts (
  receipt_id UUID PRIMARY KEY,
  scope_version TEXT NOT NULL CHECK (scope_version = 'primary-store-v1'),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX privacy_erasure_receipts_completed_idx
  ON privacy_erasure_receipts (completed_at DESC);
