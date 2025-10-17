-- Add next_run_at column to outputs table for proper scheduling
ALTER TABLE outputs ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMP;

-- Create index for efficient scheduling queries
CREATE INDEX IF NOT EXISTS idx_outputs_next_run_at ON outputs(next_run_at) WHERE active = true;

-- Update existing outputs to calculate their next_run_at based on their schedule
-- This is a one-time update for existing data
UPDATE outputs 
SET next_run_at = CURRENT_TIMESTAMP 
WHERE schedule IS NOT NULL AND next_run_at IS NULL;
