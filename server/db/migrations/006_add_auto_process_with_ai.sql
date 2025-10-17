-- Add auto_process_with_ai column to queries table
ALTER TABLE queries ADD COLUMN IF NOT EXISTS auto_process_with_ai BOOLEAN DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN queries.auto_process_with_ai IS 'When true, info packages created from this query will be automatically processed with AI';
