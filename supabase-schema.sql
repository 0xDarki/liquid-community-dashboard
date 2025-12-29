-- Supabase Database Schema for Liquid Community Dashboard
-- Run this SQL in your Supabase SQL Editor to create the necessary tables

-- Table to store mint transactions
CREATE TABLE IF NOT EXISTS mints (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL DEFAULT 'mints',
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table to store sync state
CREATE TABLE IF NOT EXISTS sync_state (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL DEFAULT 'sync_state',
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table to store token price
CREATE TABLE IF NOT EXISTS price (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL DEFAULT 'price',
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table to store historical data
CREATE TABLE IF NOT EXISTS history (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL DEFAULT 'history',
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table to store transfer transactions (burn transactions)
CREATE TABLE IF NOT EXISTS transfers (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL DEFAULT 'transfers',
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_mints_key ON mints(key);
CREATE INDEX IF NOT EXISTS idx_sync_state_key ON sync_state(key);
CREATE INDEX IF NOT EXISTS idx_price_key ON price(key);
CREATE INDEX IF NOT EXISTS idx_history_key ON history(key);
CREATE INDEX IF NOT EXISTS idx_transfers_key ON transfers(key);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to update updated_at automatically
-- Drop existing triggers if they exist before creating new ones
DROP TRIGGER IF EXISTS update_mints_updated_at ON mints;
CREATE TRIGGER update_mints_updated_at BEFORE UPDATE ON mints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sync_state_updated_at ON sync_state;
CREATE TRIGGER update_sync_state_updated_at BEFORE UPDATE ON sync_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_price_updated_at ON price;
CREATE TRIGGER update_price_updated_at BEFORE UPDATE ON price
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_history_updated_at ON history;
CREATE TRIGGER update_history_updated_at BEFORE UPDATE ON history
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transfers_updated_at ON transfers;
CREATE TRIGGER update_transfers_updated_at BEFORE UPDATE ON transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


