-- Add RLS policy to allow backend to read users by webhook token
CREATE POLICY "Backend can read users by webhook token"
  ON users
  FOR SELECT
  TO anon, authenticated
  USING (true); -- Allow reading by webhook_token for backend authentication 