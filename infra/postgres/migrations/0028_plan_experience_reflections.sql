CREATE TABLE plan_experience_reflections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL,
  plan_revision INTEGER NOT NULL CHECK (plan_revision > 0),
  experience TEXT NOT NULL CHECK (
    experience IN ('easier_than_expected', 'about_right', 'not_right_for_me', 'not_sure_yet')
  ),
  source TEXT NOT NULL DEFAULT 'user_confirmed' CHECK (source = 'user_confirmed'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plan_experience_reflections_plan_owner_fk
    FOREIGN KEY (plan_id, user_id) REFERENCES weekly_plans(id, user_id) ON DELETE CASCADE,
  UNIQUE (user_id, plan_id, plan_revision)
);

CREATE INDEX plan_experience_reflections_user_updated_idx
  ON plan_experience_reflections (user_id, updated_at DESC);
