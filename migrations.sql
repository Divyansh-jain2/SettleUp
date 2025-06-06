-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Update requests table to ensure request_to has the correct structure
ALTER TABLE requests 
    ALTER COLUMN request_to TYPE JSONB 
    USING jsonb_build_object(
        'id', (request_to->>'id'),
        'email', COALESCE(request_to->>'email', request_to->>'name')
    );

-- Add a comment to document the expected structure
COMMENT ON COLUMN requests.request_to IS 'JSONB object containing id and email of the user being requested from';

-- Add index on user email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email); 