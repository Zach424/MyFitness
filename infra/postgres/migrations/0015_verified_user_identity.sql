ALTER TABLE auth_sessions
  ADD COLUMN provider TEXT NOT NULL DEFAULT 'dev'
  CHECK (provider IN ('dev', 'wechat', 'phone'));

CREATE INDEX auth_sessions_provider_active_idx
  ON auth_sessions (provider, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE auth_identity_suppressions (
  provider TEXT NOT NULL CHECK (provider IN ('dev', 'wechat', 'phone')),
  subject_ref CHAR(64) NOT NULL CHECK (subject_ref ~ '^[0-9a-f]{64}$'),
  erasure_receipt_id UUID NOT NULL,
  suppressed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, subject_ref)
);

COMMENT ON TABLE auth_identity_suppressions IS
  'Irreversible HMAC identity references that prevent erased provider identities from being recreated.';
