CREATE TABLE users (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deletion_pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth_identities (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('dev', 'wechat', 'phone')),
  provider_subject TEXT NOT NULL CHECK (char_length(provider_subject) BETWEEN 3 AND 160),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_subject)
);

CREATE INDEX auth_identities_user_idx ON auth_identities (user_id);

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > created_at)
);

CREATE INDEX auth_sessions_user_active_idx
  ON auth_sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  age_band TEXT NOT NULL CHECK (age_band IN (
    '18_24', '25_34', '35_44', '45_54', '55_64', '65_plus'
  )),
  sex_for_calculations TEXT NOT NULL CHECK (sex_for_calculations IN (
    'female', 'male', 'unspecified'
  )),
  height_cm NUMERIC(6, 2) NOT NULL CHECK (height_cm BETWEEN 100 AND 250),
  display_height NUMERIC(6, 2) NOT NULL,
  display_height_unit TEXT NOT NULL CHECK (display_height_unit IN ('cm', 'in')),
  unit_system TEXT NOT NULL CHECK (unit_system IN ('metric', 'imperial')),
  timezone TEXT NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 64),
  adult_confirmed_at TIMESTAMPTZ NOT NULL,
  risk_status TEXT NOT NULL CHECK (risk_status IN (
    'eligible', 'professional_clearance_required'
  )),
  risk_flags TEXT[] NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (risk_flags <@ ARRAY[
    'chest_pain', 'fainting', 'uncontrolled_condition',
    'acute_injury', 'pregnancy', 'eating_disorder_history'
  ]::TEXT[]),
  CHECK (
    (risk_status = 'eligible' AND cardinality(risk_flags) = 0)
    OR (risk_status = 'professional_clearance_required' AND cardinality(risk_flags) > 0)
  )
);

CREATE TABLE user_goals (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  primary_goal TEXT NOT NULL CHECK (primary_goal IN (
    'fat_loss', 'muscle_gain', 'fitness', 'habit'
  )),
  experience TEXT NOT NULL CHECK (experience IN ('beginner', 'intermediate', 'advanced')),
  available_days TEXT[] NOT NULL CHECK (
    cardinality(available_days) BETWEEN 1 AND 7
    AND available_days <@ ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::TEXT[]
  ),
  session_minutes INTEGER NOT NULL CHECK (session_minutes BETWEEN 15 AND 180),
  equipment TEXT[] NOT NULL CHECK (
    cardinality(equipment) > 0
    AND equipment <@ ARRAY[
      'bodyweight', 'dumbbells', 'barbell', 'machines', 'bands', 'cardio'
    ]::TEXT[]
  ),
  dietary_preferences TEXT[] NOT NULL CHECK (
    cardinality(dietary_preferences) > 0
    AND dietary_preferences <@ ARRAY[
      'none', 'vegetarian', 'vegan', 'halal', 'lactose_free'
    ]::TEXT[]
    AND NOT ('none' = ANY(dietary_preferences) AND cardinality(dietary_preferences) > 1)
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE consent_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('terms', 'privacy', 'health_data')),
  version TEXT NOT NULL CHECK (char_length(version) BETWEEN 1 AND 40),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (user_id, purpose, version)
);

CREATE INDEX consent_events_user_idx ON consent_events (user_id, accepted_at DESC);
