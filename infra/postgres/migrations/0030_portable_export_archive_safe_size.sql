ALTER TABLE privacy_export_archives
  ADD CONSTRAINT privacy_export_archives_safe_byte_size_check
  CHECK (
    artifact_byte_size IS NULL OR artifact_byte_size <= 9007199254740991
  );
