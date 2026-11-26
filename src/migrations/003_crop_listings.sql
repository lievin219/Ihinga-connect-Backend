CREATE TABLE crop_listings (
  id UUID PRIMARY KEY,
  farmer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name TEXT NOT NULL CHECK (CHAR_LENGTH(crop_name) BETWEEN 1 AND 100),
  quantity_available NUMERIC(14, 3) NOT NULL CHECK (quantity_available > 0),
  unit TEXT NOT NULL CHECK (CHAR_LENGTH(unit) BETWEEN 1 AND 32),
  price_per_unit_rwf NUMERIC(14, 2) CHECK (price_per_unit_rwf IS NULL OR price_per_unit_rwf > 0),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX crop_listings_available_created_idx
ON crop_listings (created_at DESC)
WHERE is_available = TRUE;

CREATE INDEX crop_listings_farmer_created_idx
ON crop_listings (farmer_id, created_at DESC);
