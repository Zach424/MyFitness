CREATE INDEX consent_events_user_history_idx
  ON consent_events (user_id, accepted_at DESC, id DESC);
