-- Migration: Decouple info packages from queries
-- Info packages should persist even if their query batch is deleted

-- Drop the existing foreign key constraint
ALTER TABLE info_packages 
DROP CONSTRAINT IF EXISTS info_packages_query_id_fkey;

-- Make query_id nullable
ALTER TABLE info_packages 
ALTER COLUMN query_id DROP NOT NULL;

-- Add new foreign key with SET NULL instead of CASCADE
ALTER TABLE info_packages 
ADD CONSTRAINT info_packages_query_id_fkey 
FOREIGN KEY (query_id) 
REFERENCES queries(id) 
ON DELETE SET NULL;
