-- Quick fix to ensure tables and view exist with proper RLS policies

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text UNIQUE NOT NULL,
  baseline_weight decimal(5,1) NOT NULL CHECK (baseline_weight > 0),
  goal_weight decimal(5,1) NOT NULL CHECK (goal_weight > 0),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weights (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  current_weight decimal(5,1) NOT NULL CHECK (current_weight > 0),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS weights_profile_id_idx ON weights(profile_id);
CREATE INDEX IF NOT EXISTS weights_recorded_at_idx ON weights(recorded_at DESC);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE weights ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow anonymous read access" ON profiles;
DROP POLICY IF EXISTS "Allow anonymous read access" ON weights;
DROP POLICY IF EXISTS "Allow anonymous insert" ON profiles;
DROP POLICY IF EXISTS "Allow anonymous insert" ON weights;
DROP POLICY IF EXISTS "Allow anonymous update" ON profiles;
DROP POLICY IF EXISTS "Allow anonymous update" ON weights;
DROP POLICY IF EXISTS "Allow anonymous delete" ON profiles;
DROP POLICY IF EXISTS "Allow anonymous delete" ON weights;

-- Create new RLS policies for anonymous access
CREATE POLICY "Allow anonymous read access" ON profiles
FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous read access" ON weights
FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous insert" ON profiles
FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous insert" ON weights
FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous update" ON profiles
FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous update" ON weights
FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous delete" ON profiles
FOR DELETE TO anon USING (true);

CREATE POLICY "Allow anonymous delete" ON weights
FOR DELETE TO anon USING (true);

-- Drop and recreate leaderboard view
DROP VIEW IF EXISTS leaderboard;

CREATE VIEW leaderboard AS
WITH latest_weights AS (
  SELECT DISTINCT ON (profile_id) 
    profile_id,
    current_weight,
    recorded_at
  FROM weights 
  ORDER BY profile_id, recorded_at DESC
)
SELECT 
  p.id,
  p.name,
  p.baseline_weight,
  p.goal_weight,
  COALESCE(lw.current_weight, p.baseline_weight) as current_weight,
  COALESCE(lw.recorded_at, p.created_at) as last_recorded,
  p.baseline_weight - COALESCE(lw.current_weight, p.baseline_weight) as total_lost,
  CASE 
    WHEN p.baseline_weight = p.goal_weight THEN 0
    ELSE ROUND(
      (p.baseline_weight - COALESCE(lw.current_weight, p.baseline_weight)) * 100.0 / 
      (p.baseline_weight - p.goal_weight), 2
    )
  END as percentage_to_goal,
  p.created_at
FROM profiles p
LEFT JOIN latest_weights lw ON p.id = lw.profile_id
ORDER BY percentage_to_goal DESC, total_lost DESC;