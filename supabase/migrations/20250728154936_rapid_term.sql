/*
  # Create user profile trigger

  1. New Functions
    - `handle_new_user()` - Automatically creates a profile in public.users when a new user signs up
    
  2. New Triggers  
    - `on_auth_user_created` - Triggers profile creation on auth.users insert
    
  3. Security
    - Function runs with security definer privileges
    - Automatically generates webhook_token for new users
*/

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, webhook_token)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    encode(gen_random_bytes(32), 'hex')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update RLS policies for users table
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;

CREATE POLICY "Users can read own data"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Allow service role to insert user profiles (for the trigger)
CREATE POLICY "Service can create user profiles"
  ON public.users
  FOR INSERT
  TO service_role
  WITH CHECK (true);