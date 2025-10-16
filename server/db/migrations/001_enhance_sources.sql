-- Migration 001: Enhance Sources Schema
-- Add execution tracking columns and performance indexes

-- Step 1: Add columns to sources table
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_executed_at TIMESTAMP;

-- Step 2: Add status column to sources table  
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_execution_status VARCHAR(50);

-- Step 3: Add error message column to source_results
ALTER TABLE source_results ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Step 4: Create index on source_results executed_at
CREATE INDEX IF NOT EXISTS idx_source_results_executed_at ON source_results(executed_at DESC);

-- Step 5: Create index on sources last_executed_at
CREATE INDEX IF NOT EXISTS idx_sources_last_executed_at ON sources(last_executed_at DESC);

-- Step 6: Update existing records
UPDATE source_results SET error_message = data->>'error' WHERE status = 'error' AND data ? 'error' AND error_message IS NULL;
