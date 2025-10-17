-- Migration: Decouple content from info packages
-- Content should persist even if their info package is deleted

-- Drop the existing foreign key constraint
ALTER TABLE content 
DROP CONSTRAINT IF EXISTS content_info_package_id_fkey;

-- Make info_package_id nullable
ALTER TABLE content 
ALTER COLUMN info_package_id DROP NOT NULL;

-- Add new foreign key with SET NULL instead of CASCADE
ALTER TABLE content 
ADD CONSTRAINT content_info_package_id_fkey 
FOREIGN KEY (info_package_id) 
REFERENCES info_packages(id) 
ON DELETE SET NULL;
