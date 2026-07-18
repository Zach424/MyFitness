CREATE TABLE nutrition_meals (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('manual', 'imported')),
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 64),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  request_hash CHAR(64) NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX nutrition_meals_user_occurred_idx
  ON nutrition_meals (user_id, occurred_at DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE nutrition_meal_items (
  id UUID PRIMARY KEY,
  meal_id UUID NOT NULL REFERENCES nutrition_meals(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 100),
  food_key TEXT NOT NULL CHECK (food_key ~ '^[a-z0-9_:-]{2,100}$'),
  food_name TEXT NOT NULL CHECK (char_length(food_name) BETWEEN 1 AND 100),
  food_category TEXT NOT NULL CHECK (
    food_category IN ('staple', 'protein', 'vegetable', 'fruit', 'dairy', 'snack', 'custom')
  ),
  energy_kcal_per_100g NUMERIC(10, 3) NOT NULL CHECK (
    energy_kcal_per_100g BETWEEN 0 AND 1000
  ),
  protein_g_per_100g NUMERIC(10, 3) NOT NULL CHECK (protein_g_per_100g BETWEEN 0 AND 100),
  carbohydrate_g_per_100g NUMERIC(10, 3) NOT NULL CHECK (
    carbohydrate_g_per_100g BETWEEN 0 AND 100
  ),
  fat_g_per_100g NUMERIC(10, 3) NOT NULL CHECK (fat_g_per_100g BETWEEN 0 AND 100),
  fiber_g_per_100g NUMERIC(10, 3) CHECK (fiber_g_per_100g BETWEEN 0 AND 100),
  reference TEXT CHECK (reference IS NULL OR char_length(reference) <= 200),
  display_amount NUMERIC(12, 3) NOT NULL CHECK (display_amount > 0 AND display_amount <= 10000),
  display_unit TEXT NOT NULL CHECK (display_unit IN ('g', 'ml', 'piece', 'serving')),
  canonical_grams NUMERIC(12, 3) NOT NULL CHECK (
    canonical_grams > 0 AND canonical_grams <= 10000
  ),
  UNIQUE (meal_id, position)
);

CREATE TABLE nutrition_favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_key TEXT NOT NULL CHECK (food_key ~ '^[a-z0-9_:-]{2,100}$'),
  food_name TEXT NOT NULL CHECK (char_length(food_name) BETWEEN 1 AND 100),
  food_category TEXT NOT NULL CHECK (
    food_category IN ('staple', 'protein', 'vegetable', 'fruit', 'dairy', 'snack', 'custom')
  ),
  energy_kcal_per_100g NUMERIC(10, 3) NOT NULL CHECK (
    energy_kcal_per_100g BETWEEN 0 AND 1000
  ),
  protein_g_per_100g NUMERIC(10, 3) NOT NULL CHECK (protein_g_per_100g BETWEEN 0 AND 100),
  carbohydrate_g_per_100g NUMERIC(10, 3) NOT NULL CHECK (
    carbohydrate_g_per_100g BETWEEN 0 AND 100
  ),
  fat_g_per_100g NUMERIC(10, 3) NOT NULL CHECK (fat_g_per_100g BETWEEN 0 AND 100),
  fiber_g_per_100g NUMERIC(10, 3) CHECK (fiber_g_per_100g BETWEEN 0 AND 100),
  reference TEXT CHECK (reference IS NULL OR char_length(reference) <= 200),
  default_amount NUMERIC(12, 3) NOT NULL CHECK (default_amount > 0 AND default_amount <= 10000),
  default_unit TEXT NOT NULL CHECK (default_unit IN ('g', 'ml', 'piece', 'serving')),
  default_grams NUMERIC(12, 3) NOT NULL CHECK (default_grams > 0 AND default_grams <= 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, food_key)
);

CREATE TABLE nutrition_meal_revisions (
  id UUID PRIMARY KEY,
  meal_id UUID NOT NULL REFERENCES nutrition_meals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meal_id, revision)
);

CREATE INDEX nutrition_meal_revisions_user_meal_idx
  ON nutrition_meal_revisions (user_id, meal_id, revision DESC);
