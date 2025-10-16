-- Migration: Add next_run_at column for scheduler tracking
-- This enables start time offset scheduling

-- Add next_run_at column to queries table
ALTER TABLE queries 
ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMP;

-- Create index for scheduler queries
CREATE INDEX IF NOT EXISTS idx_queries_next_run_at 
ON queries(next_run_at) 
WHERE active = true;
