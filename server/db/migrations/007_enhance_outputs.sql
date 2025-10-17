-- Migration 007: Enhance Outputs System

-- Add next_run_at field to outputs table for scheduling
ALTER TABLE outputs ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMP;

-- Create junction table for output tags
CREATE TABLE IF NOT EXISTS output_tags (
    output_id INTEGER REFERENCES outputs(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (output_id, tag_id)
);

-- Add output_content field to output_logs to store combined content
ALTER TABLE output_logs ADD COLUMN IF NOT EXISTS output_content TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_output_tags_output_id ON output_tags(output_id);
CREATE INDEX IF NOT EXISTS idx_output_tags_tag_id ON output_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_outputs_next_run_at ON outputs(next_run_at) WHERE active = true;
