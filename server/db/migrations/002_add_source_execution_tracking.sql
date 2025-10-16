-- Add execution tracking columns to sources table
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_executed_at TIMESTAMP;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_execution_status VARCHAR(50);

-- Add error_message column to source_results table
ALTER TABLE source_results ADD COLUMN IF NOT EXISTS error_message TEXT;
