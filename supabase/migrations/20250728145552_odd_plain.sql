/*
  # SERP Analysis Application Schema

  1. New Tables
    - `users`
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `password_hash` (text)
      - `full_name` (text)
      - `webhook_token` (text, unique)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `api_keys`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `key_name` (text)
      - `api_key` (text, encrypted)
      - `provider` (text) - 'apify' or 'moz'
      - `status` (text) - 'active', 'failed', 'rate_limited'
      - `credits_remaining` (integer)
      - `last_used` (timestamp)
      - `last_failed` (timestamp)
      - `failure_count` (integer)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `analysis_logs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `request_id` (text)
      - `keywords` (jsonb)
      - `results` (jsonb)
      - `api_keys_used` (jsonb)
      - `status` (text)
      - `error_message` (text)
      - `processing_time` (integer)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
*/

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  webhook_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  key_name text NOT NULL,
  api_key text NOT NULL,
  provider text NOT NULL DEFAULT 'apify',
  status text NOT NULL DEFAULT 'active',
  credits_remaining integer DEFAULT 0,
  last_used timestamptz,
  last_failed timestamptz,
  failure_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Analysis Logs table
CREATE TABLE IF NOT EXISTS analysis_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  request_id text NOT NULL,
  keywords jsonb NOT NULL,
  results jsonb,
  api_keys_used jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  processing_time integer,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- RLS Policies for api_keys
CREATE POLICY "Users can manage own API keys"
  ON api_keys
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for analysis_logs
CREATE POLICY "Users can read own analysis logs"
  ON analysis_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service can create analysis logs"
  ON analysis_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
CREATE INDEX IF NOT EXISTS idx_analysis_logs_user_id ON analysis_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_logs_created_at ON analysis_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_users_webhook_token ON users(webhook_token);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
