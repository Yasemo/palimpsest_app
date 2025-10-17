-- Migration 005: Add Tags System

-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    color VARCHAR(7) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create junction table for query tags
CREATE TABLE IF NOT EXISTS query_tags (
    query_id INTEGER REFERENCES queries(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (query_id, tag_id)
);

-- Create junction table for info package tags
CREATE TABLE IF NOT EXISTS info_package_tags (
    info_package_id INTEGER REFERENCES info_packages(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (info_package_id, tag_id)
);

-- Create junction table for content tags
CREATE TABLE IF NOT EXISTS content_tags (
    content_id INTEGER REFERENCES content(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (content_id, tag_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_query_tags_query_id ON query_tags(query_id);
CREATE INDEX IF NOT EXISTS idx_query_tags_tag_id ON query_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_info_package_tags_info_package_id ON info_package_tags(info_package_id);
CREATE INDEX IF NOT EXISTS idx_info_package_tags_tag_id ON info_package_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_content_tags_content_id ON content_tags(content_id);
CREATE INDEX IF NOT EXISTS idx_content_tags_tag_id ON content_tags(tag_id);
