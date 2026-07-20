ALTER TABLE auth_identities
  DROP CONSTRAINT auth_identities_provider_check,
  ADD CONSTRAINT auth_identities_provider_check
    CHECK (provider IN ('dev', 'wechat', 'oidc', 'phone'));

ALTER TABLE auth_sessions
  DROP CONSTRAINT auth_sessions_provider_check,
  ADD CONSTRAINT auth_sessions_provider_check
    CHECK (provider IN ('dev', 'wechat', 'oidc', 'phone'));

ALTER TABLE auth_identity_suppressions
  DROP CONSTRAINT auth_identity_suppressions_provider_check,
  ADD CONSTRAINT auth_identity_suppressions_provider_check
    CHECK (provider IN ('dev', 'wechat', 'oidc', 'phone'));
