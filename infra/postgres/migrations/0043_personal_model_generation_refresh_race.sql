CREATE FUNCTION enforce_personal_model_retirement_remains_settled()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.retired_at IS NULL
    AND NEW.retired_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM personal_model_source_refresh_requests AS request
      LEFT JOIN personal_model_source_refresh_resolutions AS resolution
        ON resolution.request_id = request.id
      WHERE request.user_id = NEW.user_id
        AND request.item_id = NEW.id
        AND resolution.request_id IS NULL
    ) THEN
    RAISE EXCEPTION 'retired personal model generation gained a pending source refresh';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER personal_model_items_retirement_settled_guard
  AFTER UPDATE ON personal_model_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_personal_model_retirement_remains_settled();

CREATE FUNCTION enforce_personal_model_source_refresh_targets_current_generation()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM personal_model_items
    WHERE user_id = NEW.user_id
      AND id = NEW.item_id
      AND current_revision = NEW.affected_item_revision
      AND retired_at IS NULL
  ) THEN
    RAISE EXCEPTION 'source refresh request must target the current personal model generation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER personal_model_source_refresh_requests_generation_guard
  AFTER INSERT ON personal_model_source_refresh_requests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_personal_model_source_refresh_targets_current_generation();
