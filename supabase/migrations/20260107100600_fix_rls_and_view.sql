-- Quick fix to ensure RLS policies and view are properly set up

-- Drop and recreate all RLS policies to ensure they work correctly
DROP POLICY IF EXISTS "Allow anonymous read access" ON profiles;
DROP POLICY IF EXISTS "Allow anonymous read access" ON weights;
DROP POLICY IF EXISTS "Allow anonymous insert" ON profiles;
DROP POLICY IF EXISTS "Allow anonymous insert" ON weights;
DROP POLICY IF EXISTS "Allow anonymous update" ON profiles;
DROP POLICY IF EXISTS "Allow anonymous update" ON weights;
DROP POLICY IF EXISTS "Allow anonymous delete" ON profiles;
DROP POLICY IF EXISTS "Allow anonymous delete" ON weights;

-- Recreate RLS policies for anonymous access
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

-- Ensure the leaderboard view exists and is accessible
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