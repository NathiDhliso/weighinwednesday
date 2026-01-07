-- Run this in Supabase SQL Editor to fix delete permissions

-- First, check current policies
SELECT tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('profiles', 'weights');

-- Drop existing delete policies and recreate them
DROP POLICY IF EXISTS "Allow anonymous delete" ON profiles;
DROP POLICY IF EXISTS "Allow anonymous delete" ON weights;

-- Create delete policies for anon role
CREATE POLICY "Allow anonymous delete" ON profiles
FOR DELETE TO anon USING (true);

CREATE POLICY "Allow anonymous delete" ON weights
FOR DELETE TO anon USING (true);

-- Also add policies for public role (in case your client uses public instead of anon)
DROP POLICY IF EXISTS "Allow public delete" ON profiles;
DROP POLICY IF EXISTS "Allow public delete" ON weights;

CREATE POLICY "Allow public delete" ON profiles
FOR DELETE TO public USING (true);

CREATE POLICY "Allow public delete" ON weights
FOR DELETE TO public USING (true);

-- Verify the policies were created
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies 
WHERE tablename IN ('profiles', 'weights')
ORDER BY tablename, cmd;
