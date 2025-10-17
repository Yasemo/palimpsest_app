-- Palimpsest Database Schema

-- Sources table: External data source configurations
CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'perplexity', extensible for future
    config JSONB NOT NULL, -- Source-specific configuration
    schedule VARCHAR(100), -- Cron expression
    active BOOLEAN DEFAULT true,
    last_executed_at TIMESTAMP,
    last_execution_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Source results: Raw data from executed sources
CREATE TABLE IF NOT EXISTS source_results (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'success', -- 'success', 'error'
    error_message TEXT
);

-- Queries: Batch query configurations
CREATE TABLE IF NOT EXISTS queries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    query_config JSONB NOT NULL, -- Table selections and filters
    directive TEXT NOT NULL, -- Instructions for AI
    schedule VARCHAR(100), -- Cron expression
    active BOOLEAN DEFAULT true,
    next_run_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Info packages: Query results with directive
CREATE TABLE IF NOT EXISTS info_packages (
    id SERIAL PRIMARY KEY,
    query_id INTEGER REFERENCES queries(id) ON DELETE SET NULL,
    data JSONB NOT NULL, -- Queried data from database
    directive TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT false
);

-- AI configuration: AI settings (single row)
CREATE TABLE IF NOT EXISTS ai_config (
    id SERIAL PRIMARY KEY,
    model VARCHAR(255) NOT NULL,
    system_prompt TEXT,
    temperature DECIMAL(3,2) DEFAULT 0.7,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (id = 1) -- Ensure only one row
);

-- Note: Default AI config is inserted by setup.ts using DEFAULT_AI_MODEL environment variable

-- Content: AI-generated content
CREATE TABLE IF NOT EXISTS content (
    id SERIAL PRIMARY KEY,
    info_package_id INTEGER REFERENCES info_packages(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    chat_history JSONB DEFAULT '[]'::jsonb, -- Array of chat messages
    edited_content TEXT, -- Manually or AI-edited content
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Outputs: Output configurations
CREATE TABLE IF NOT EXISTS outputs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'gmail', extensible for future
    config JSONB NOT NULL, -- Output-specific configuration
    schedule VARCHAR(100), -- Cron expression
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Output logs: Output execution history
CREATE TABLE IF NOT EXISTS output_logs (
    id SERIAL PRIMARY KEY,
    output_id INTEGER REFERENCES outputs(id) ON DELETE CASCADE,
    content_ids INTEGER[] NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'success', -- 'success', 'error'
    details TEXT
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sources_active ON sources(active);
CREATE INDEX IF NOT EXISTS idx_sources_last_executed_at ON sources(last_executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_results_source_id ON source_results(source_id);
CREATE INDEX IF NOT EXISTS idx_source_results_executed_at ON source_results(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_queries_active ON queries(active);
CREATE INDEX IF NOT EXISTS idx_queries_next_run_at ON queries(next_run_at) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_info_packages_query_id ON info_packages(query_id);
CREATE INDEX IF NOT EXISTS idx_info_packages_processed ON info_packages(processed);
CREATE INDEX IF NOT EXISTS idx_content_info_package_id ON content(info_package_id);
CREATE INDEX IF NOT EXISTS idx_outputs_active ON outputs(active);
CREATE INDEX IF NOT EXISTS idx_output_logs_output_id ON output_logs(output_id);

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at columns
CREATE TRIGGER update_sources_updated_at BEFORE UPDATE ON sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_queries_updated_at BEFORE UPDATE ON queries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_config_updated_at BEFORE UPDATE ON ai_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_updated_at BEFORE UPDATE ON content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_outputs_updated_at BEFORE UPDATE ON outputs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
