-- src/db/schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Attempts table (shared with main backend)
CREATE TABLE IF NOT EXISTS attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contest_id UUID NOT NULL,
    player_id UUID NOT NULL,
    user_id UUID NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    game_id INTEGER NOT NULL,
    difficulty VARCHAR(20) NOT NULL,
    
    -- Game data
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    extracted_answer VARCHAR(500),
    is_correct BOOLEAN DEFAULT FALSE,
    
    -- Verification data (filled by this server)
    verified BOOLEAN DEFAULT FALSE,
    verification_data JSONB,
    ipfs_hash VARCHAR(100),
    blockchain_tx_hash VARCHAR(66),
    tee_attestation TEXT,
    
    -- Metadata
    prompt_number INTEGER,
    was_paid BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_attempts_id ON attempts(id);
CREATE INDEX IF NOT EXISTS idx_attempts_verified ON attempts(verified);
CREATE INDEX IF NOT EXISTS idx_attempts_contest ON attempts(contest_id);
CREATE INDEX IF NOT EXISTS idx_attempts_wallet ON attempts(wallet_address);

-- Game commitments (answer hashes)
CREATE TABLE IF NOT EXISTS game_commitments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contest_id UUID NOT NULL,
    game_id INTEGER NOT NULL,
    difficulty VARCHAR(20) NOT NULL,
    commitment_hash VARCHAR(66) NOT NULL,
    salt_hint VARCHAR(66),
    full_salt VARCHAR(66),
    answer TEXT,
    revealed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revealed_at TIMESTAMP,
    UNIQUE(contest_id, game_id, difficulty)
);

CREATE INDEX IF NOT EXISTS idx_commitments_contest ON game_commitments(contest_id);
CREATE INDEX IF NOT EXISTS idx_commitments_game ON game_commitments(game_id);

-- Verification logs (audit trail)
CREATE TABLE IF NOT EXISTS verification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attempt_id UUID NOT NULL REFERENCES attempts(id),
    verification_status VARCHAR(20) NOT NULL, -- started, completed, failed
    ipfs_hash VARCHAR(100),
    tx_hash VARCHAR(66),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verification_logs_attempt ON verification_logs(attempt_id);