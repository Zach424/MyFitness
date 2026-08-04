ALTER TABLE weekly_plans
  ADD CONSTRAINT weekly_plans_id_user_unique UNIQUE (id, user_id);

ALTER TABLE workout_sessions
  ADD CONSTRAINT workout_sessions_id_user_unique UNIQUE (id, user_id);

CREATE TABLE plan_workout_links (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL,
  plan_revision INTEGER NOT NULL CHECK (plan_revision > 0),
  session_date DATE NOT NULL,
  workout_id UUID NOT NULL,
  workout_revision INTEGER NOT NULL CHECK (workout_revision > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unlinked_at TIMESTAMPTZ,
  unlink_reason TEXT CHECK (unlink_reason IN ('user', 'workout_deleted')),
  CONSTRAINT plan_workout_links_plan_owner_fk
    FOREIGN KEY (plan_id, user_id) REFERENCES weekly_plans(id, user_id) ON DELETE CASCADE,
  CONSTRAINT plan_workout_links_workout_owner_fk
    FOREIGN KEY (workout_id, user_id) REFERENCES workout_sessions(id, user_id) ON DELETE CASCADE,
  CHECK (
    (unlinked_at IS NULL AND unlink_reason IS NULL)
    OR (unlinked_at IS NOT NULL AND unlink_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX plan_workout_links_active_session_unique
  ON plan_workout_links (user_id, plan_id, plan_revision, session_date)
  WHERE unlinked_at IS NULL;

CREATE UNIQUE INDEX plan_workout_links_active_workout_unique
  ON plan_workout_links (user_id, workout_id)
  WHERE unlinked_at IS NULL;

CREATE INDEX plan_workout_links_user_plan_idx
  ON plan_workout_links (user_id, plan_id, linked_at DESC);
