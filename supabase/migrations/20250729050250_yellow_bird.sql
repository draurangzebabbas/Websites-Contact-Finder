/*
  # Fix User Profile Creation Trigger

  This migration fixes the user profile creation trigger that was causing
  signup failures. The issue was that the trigger function didn't have
  proper permissions to insert into the users table due to RLS policies.

  ## Changes Made
  1. Drop and recreate the trigger function with proper security context
  2. Update RLS policies to allow the trigger function to insert users
  3. Ensure the function runs with elevated privileges (SECURITY DEFINER)
  4. Add proper error handling in the trigger function

  ## Security
  - The trigger function runs with SECURITY DEFINER to bypass RLS
  - RLS policies are updated to allow service role insertions
  - Users can still only read/update their own data
*/

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create the trigger function with proper security context
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    full_name,
    webhook_token
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    encode(gen_random_bytes(32), 'hex')
  );
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log the error but don't fail the auth process
    RAISE LOG 'Error creating user profile: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update RLS policies to allow the trigger function to work
DROP POLICY IF EXISTS "Service can create user profiles" ON public.users;
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;

-- Allow service role (used by triggers) to insert user profiles
CREATE POLICY "Service can create user profiles"
  ON public.users
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow authenticated users to read their own data
CREATE POLICY "Users can read own data"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow authenticated users to update their own data
CREATE POLICY "Users can update own data"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Ensure RLS is enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;