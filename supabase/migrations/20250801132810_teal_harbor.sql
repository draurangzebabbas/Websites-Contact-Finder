/*
  # Fix users table schema

  1. Schema Changes
    - Remove password_hash column (not needed for Supabase Auth)
    - Make webhook_token nullable with default value
    - Ensure proper constraints and indexes

  2. Security
    - Maintain existing RLS policies
    - Keep webhook_token generation secure
*/

-- Remove password_hash column if it exists (it shouldn't be in public.users)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'password_hash' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.users DROP COLUMN password_hash;
  END IF;
END $$;

-- Ensure webhook_token has proper default and is nullable
DO $$
BEGIN
  -- Check if webhook_token column exists and update it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'webhook_token' AND table_schema = 'public'
  ) THEN
    -- Make sure it's nullable and has a default
    ALTER TABLE public.users ALTER COLUMN webhook_token DROP NOT NULL;
    ALTER TABLE public.users ALTER COLUMN webhook_token SET DEFAULT encode(gen_random_bytes(32), 'hex');
  END IF;
END $$;

-- Ensure the table structure is correct
DO $$
BEGIN
  -- Recreate the table with correct structure if needed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'users' AND table_schema = 'public'
  ) THEN
    CREATE TABLE public.users (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text NOT NULL,
      full_name text NOT NULL,
      webhook_token text DEFAULT encode(gen_random_bytes(32), 'hex'),
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    
    -- Enable RLS
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    
    -- Create policies
    CREATE POLICY "Users can read own data" ON public.users
      FOR SELECT TO authenticated
      USING (auth.uid() = id);
      
    CREATE POLICY "Users can update own data" ON public.users
      FOR UPDATE TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
      
    CREATE POLICY "Users can create own profile" ON public.users
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = id);
      
    CREATE POLICY "Service can create user profiles" ON public.users
      FOR INSERT TO service_role
      WITH CHECK (true);
  END IF;
END $$;