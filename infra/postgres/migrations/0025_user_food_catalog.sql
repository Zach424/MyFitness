CREATE TABLE user_food_catalog_entries (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  aliases TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL CHECK (
    category IN ('staple', 'protein', 'vegetable', 'fruit', 'dairy', 'snack', 'custom')
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
  reference TEXT NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 2 AND 200),
  default_amount NUMERIC(12, 3) NOT NULL CHECK (default_amount > 0 AND default_amount <= 10000),
  default_unit TEXT NOT NULL CHECK (default_unit IN ('g', 'ml', 'piece', 'serving')),
  default_grams NUMERIC(12, 3) NOT NULL CHECK (default_grams > 0 AND default_grams <= 10000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  request_hash CHAR(64) NOT NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX user_food_catalog_active_name_unique
  ON user_food_catalog_entries (user_id, lower(btrim(name)))
  WHERE archived_at IS NULL;

CREATE INDEX user_food_catalog_user_updated_idx
  ON user_food_catalog_entries (user_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE user_food_catalog_revisions (
  id UUID PRIMARY KEY,
  entry_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'archived')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_id, revision),
  CONSTRAINT user_food_catalog_revision_owner_fk
    FOREIGN KEY (entry_id, user_id)
    REFERENCES user_food_catalog_entries(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX user_food_catalog_revisions_user_entry_idx
  ON user_food_catalog_revisions (user_id, entry_id, revision DESC);
