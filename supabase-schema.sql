-- Supabase SQL Schema for Reddit Script V2
-- Run this in your Supabase SQL editor

-- Table for access codes
CREATE TABLE IF NOT EXISTS access_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code VARCHAR(8) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE
);

-- Index for faster code lookups
CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);
CREATE INDEX IF NOT EXISTS idx_access_codes_expires ON access_codes(expires_at);

-- Table for saved scripts
CREATE TABLE IF NOT EXISTS saved_scripts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster timestamp sorting
CREATE INDEX IF NOT EXISTS idx_saved_scripts_created ON saved_scripts(created_at DESC);

-- Function to clean up expired codes automatically
CREATE OR REPLACE FUNCTION cleanup_expired_codes()
RETURNS void AS $$
BEGIN
    DELETE FROM access_codes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a scheduled job to clean up expired codes (run manually or set up in Supabase)
-- You can also call this function periodically from your app

