ALTER TABLE ai_explanation_runs
  DROP CONSTRAINT ai_explanation_runs_validator_version_check;

ALTER TABLE ai_explanation_runs
  ADD CONSTRAINT ai_explanation_runs_validator_version_check
  CHECK (validator_version IN (
    'plan-explanation-safety-v1',
    'plan-explanation-safety-v2'
  ));

ALTER TABLE nutrition_photo_candidates
  DROP CONSTRAINT nutrition_photo_candidates_prompt_version_check,
  DROP CONSTRAINT nutrition_photo_candidates_validator_version_check;

ALTER TABLE nutrition_photo_candidates
  ADD CONSTRAINT nutrition_photo_candidates_prompt_version_check
  CHECK (prompt_version IN (
    'food-photo-candidates-v1',
    'food-photo-candidates-v2'
  )),
  ADD CONSTRAINT nutrition_photo_candidates_validator_version_check
  CHECK (validator_version IN (
    'food-photo-catalog-safety-v1',
    'food-photo-catalog-safety-v2'
  ));
