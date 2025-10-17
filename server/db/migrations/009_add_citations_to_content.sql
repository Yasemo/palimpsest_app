-- Add citations field to content table
ALTER TABLE content ADD COLUMN IF NOT EXISTS citations JSONB DEFAULT '[]'::jsonb;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_content_citations ON content USING GIN (citations);
