CREATE FUNCTION ilens_text_array_is_unique(values_to_check TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT cardinality(values_to_check) = COUNT(DISTINCT value)
  FROM unnest(values_to_check) AS value
$$;

ALTER TABLE user_exercise_catalog_entries
  ADD COLUMN muscle_model_version TEXT,
  ADD COLUMN muscle_mapping_source TEXT,
  ADD COLUMN primary_muscles TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN secondary_muscles TEXT[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT user_exercise_catalog_muscle_model_version_check CHECK (
    muscle_model_version IS NULL OR muscle_model_version = 'ilens-muscle-model-v1'
  ),
  ADD CONSTRAINT user_exercise_catalog_muscle_mapping_source_check CHECK (
    muscle_mapping_source IS NULL OR muscle_mapping_source = 'user_confirmed'
  ),
  ADD CONSTRAINT user_exercise_catalog_primary_muscles_check CHECK (
    cardinality(primary_muscles) <= 8
    AND primary_muscles <@ ARRAY[
      'chest_upper', 'chest_middle', 'chest_lower',
      'latissimus_dorsi', 'trapezius', 'rhomboids', 'teres_major', 'teres_minor',
      'erector_spinae', 'deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior',
      'biceps_brachii', 'triceps_brachii', 'brachialis', 'forearms',
      'gluteus_maximus', 'gluteus_medius', 'quadriceps', 'hamstrings', 'adductors',
      'gastrocnemius', 'soleus', 'rectus_abdominis', 'obliques'
    ]::text[]
    AND ilens_text_array_is_unique(primary_muscles)
  ),
  ADD CONSTRAINT user_exercise_catalog_secondary_muscles_check CHECK (
    cardinality(secondary_muscles) <= 12
    AND secondary_muscles <@ ARRAY[
      'chest_upper', 'chest_middle', 'chest_lower',
      'latissimus_dorsi', 'trapezius', 'rhomboids', 'teres_major', 'teres_minor',
      'erector_spinae', 'deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior',
      'biceps_brachii', 'triceps_brachii', 'brachialis', 'forearms',
      'gluteus_maximus', 'gluteus_medius', 'quadriceps', 'hamstrings', 'adductors',
      'gastrocnemius', 'soleus', 'rectus_abdominis', 'obliques'
    ]::text[]
    AND ilens_text_array_is_unique(secondary_muscles)
  ),
  ADD CONSTRAINT user_exercise_catalog_muscle_mapping_shape_check CHECK (
    (
      muscle_model_version IS NULL
      AND muscle_mapping_source IS NULL
      AND cardinality(primary_muscles) = 0
      AND cardinality(secondary_muscles) = 0
    ) OR (
      muscle_model_version = 'ilens-muscle-model-v1'
      AND muscle_mapping_source = 'user_confirmed'
      AND cardinality(primary_muscles) BETWEEN 1 AND 8
      AND NOT (primary_muscles && secondary_muscles)
    )
  );
