CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS templates(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name TEXT,original_name TEXT,mime_type TEXT,size_bytes BIGINT,file_data BYTEA,embed_url_excel TEXT,embed_url_google TEXT,created_at TIMESTAMPTZ DEFAULT NOW());
