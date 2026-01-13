-- Run this in pgAdmin (database: railway) once
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('single','range')),
  label TEXT NOT NULL,
  cell_ref TEXT,
  range_ref TEXT,
  field_type TEXT NOT NULL CHECK (field_type IN ('text','number','date')),
  required BOOLEAN NOT NULL DEFAULT false,
  validation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind='single' AND cell_ref IS NOT NULL AND range_ref IS NULL)
    OR
    (kind='range' AND range_ref IS NOT NULL AND cell_ref IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_template_fields_template ON template_fields(template_id);
