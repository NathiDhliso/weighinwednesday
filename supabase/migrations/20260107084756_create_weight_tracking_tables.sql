/*
  # Weight Tracking Dashboard - Complete Schema

  ## Overview
  Creates a complete weight tracking system for friend groups with real-time leaderboard functionality.

  ## Tables Created
  
  ### 1. profiles
  Stores participant information and weight goals
  - `id` (uuid, primary key) - Unique identifier
  - `name` (text, unique) - Participant name
  - `baseline_weight` (decimal) - Starting weight in kg
  - `goal_weight` (decimal) - Target weight in kg
  - `created_at` (timestamptz) - Profile creation timestamp

  ### 2. weights
  Stores all weight measurements over time
  - `id` (uuid, primary key) - Unique identifier
  - `profile_id` (uuid, foreign key) - Links to profiles table
  - `current_weight` (decimal) - Recorded weight in kg
  - `recorded_at` (timestamptz) - When weight was recorded

  ## Views Created

  ### leaderboard
  Auto-calculates rankings with latest weights and progress percentages
  - Joins profiles with most recent weight entry
  - Calculates total weight lost
  - Calculates percentage toward goal
  - Orders by percentage descending (best progress first)

  ### weekly_stats
  Tracks week-over-week weight changes for each participant
  - Compares last two weigh-ins within 8-day window
  - Used for weekly progress reports

  ## Performance
  - Indexes on profile_id and recorded_at for fast queries
  - Views are optimized with DISTINCT ON for latest weights

  ## Security
  - Row Level Security enabled on both tables
  - Public read access (for leaderboard viewing)
  - Anonymous insert access (for admin panel without auth)
*/

-- ============================================================
-- 1. CREATE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  baseline_weight DECIMAL(5,2) NOT NULL,
  goal_weight DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  current_weight DECIMAL(5,2) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_weights_profile ON weights(profile_id);
CREATE INDEX IF NOT EXISTS idx_weights_date ON weights(recorded_at DESC);

-- ============================================================
-- 3. CREATE AUTO-CALCULATING LEADERBOARD VIEW
-- ============================================================

CREATE OR REPLACE VIEW leaderboard AS
WITH latest_weights AS (
  SELECT DISTINCT ON (profile_id) *
  FROM weights
  ORDER BY profile_id, recorded_at DESC
)
SELECT 
  p.id,
  p.name,
  p.baseline_weight,
  p.goal_weight,
  lw.current_weight,
  lw.recorded_at as last_weigh_in,
  (p.baseline_weight - lw.current_weight) as weight_lost,
  ROUND(
    ((p.baseline_weight - lw.current_weight) / 
    NULLIF(p.baseline_weight - p.goal_weight, 0)) * 100, 
    2
  ) as percentage_lost
FROM profiles p
LEFT JOIN latest_weights lw ON p.id = lw.profile_id
ORDER BY percentage_lost DESC NULLS LAST;

-- ============================================================
-- 4. CREATE WEEKLY STATS VIEW FOR WHATSAPP SHARE
-- ============================================================

CREATE OR REPLACE VIEW weekly_stats AS
WITH last_two_weights AS (
  SELECT 
    profile_id,
    current_weight,
    recorded_at,
    LAG(current_weight) OVER (PARTITION BY profile_id ORDER BY recorded_at ASC) as previous_weight
  FROM weights
  WHERE recorded_at > NOW() - INTERVAL '8 days'
)
SELECT 
  profile_id,
  (previous_weight - current_weight) as weekly_loss
FROM last_two_weights
WHERE previous_weight IS NOT NULL;

-- ============================================================
-- 5. ROW LEVEL SECURITY POLICIES
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE weights ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access (public leaderboard)
CREATE POLICY "Allow anonymous read access" ON profiles
FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous read access" ON weights
FOR SELECT TO anon USING (true);

-- Allow anonymous inserts (admin panel without auth)
CREATE POLICY "Allow anonymous insert" ON profiles
FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous insert" ON weights
FOR INSERT TO anon WITH CHECK (true);

-- Allow anonymous updates (admin panel editing)
CREATE POLICY "Allow anonymous update" ON profiles
FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous update" ON weights
FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Allow anonymous deletes (admin panel deletion)
CREATE POLICY "Allow anonymous delete" ON profiles
FOR DELETE TO anon USING (true);

CREATE POLICY "Allow anonymous delete" ON weights
FOR DELETE TO anon USING (true);