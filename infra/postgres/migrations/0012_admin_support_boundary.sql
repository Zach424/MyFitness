CREATE TABLE admin_operators (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_operator_roles (
  operator_id UUID NOT NULL REFERENCES admin_operators(id),
  role TEXT NOT NULL CHECK (role IN ('support_reader', 'audit_reader')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (operator_id, role)
);

CREATE TABLE admin_identities (
  id UUID PRIMARY KEY,
  operator_id UUID NOT NULL REFERENCES admin_operators(id),
  provider TEXT NOT NULL CHECK (provider IN ('dev', 'oidc')),
  issuer TEXT NOT NULL CHECK (char_length(issuer) BETWEEN 3 AND 512),
  provider_subject TEXT NOT NULL CHECK (char_length(provider_subject) BETWEEN 3 AND 160),
  verified_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, issuer, provider_subject)
);

CREATE INDEX admin_identities_operator_idx ON admin_identities (operator_id);

CREATE TABLE admin_sessions (
  id UUID PRIMARY KEY,
  operator_id UUID NOT NULL REFERENCES admin_operators(id),
  identity_id UUID NOT NULL REFERENCES admin_identities(id),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > created_at)
);

CREATE INDEX admin_sessions_operator_active_idx
  ON admin_sessions (operator_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE admin_oidc_exchanges (
  token_hash CHAR(64) PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES admin_identities(id),
  token_expires_at TIMESTAMPTZ NOT NULL,
  exchanged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (token_expires_at > exchanged_at)
);

CREATE TABLE admin_audit_events (
  id UUID PRIMARY KEY,
  operator_id UUID REFERENCES admin_operators(id),
  action TEXT NOT NULL CHECK (action IN (
    'operator.session.created',
    'operator.session.denied',
    'operator.session.revoked',
    'operator.profile.read',
    'support.user.lookup',
    'audit.events.read',
    'authorization.denied'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied', 'not_found')),
  target_type TEXT CHECK (target_type IN ('operator', 'user', 'audit')),
  target_ref CHAR(64),
  request_id UUID NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(details) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((target_type IS NULL) = (target_ref IS NULL))
);

CREATE INDEX admin_audit_events_occurred_idx
  ON admin_audit_events (occurred_at DESC, id DESC);
CREATE INDEX admin_audit_events_operator_idx
  ON admin_audit_events (operator_id, occurred_at DESC);

CREATE FUNCTION reject_admin_audit_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin audit events are append-only';
END;
$$;

CREATE TRIGGER admin_audit_events_immutable
BEFORE UPDATE OR DELETE ON admin_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_event_mutation();
