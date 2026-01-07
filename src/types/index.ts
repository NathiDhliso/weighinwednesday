export interface Profile {
  id: string;
  name: string;
  baseline_weight: number;
  goal_weight: number;
  created_at: string;
}

export interface Weight {
  id: string;
  profile_id: string;
  current_weight: number;
  recorded_at: string;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  baseline_weight: number;
  goal_weight: number;
  current_weight: number | null;
  last_weigh_in: string | null;
  weight_lost: number | null;
  percentage_lost: number | null;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'achievement';
  message: string;
  timestamp: number;
  duration?: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  criteria: (profile: LeaderboardEntry, history: Weight[]) => boolean;
  unlockedAt?: string;
}

export interface FormErrors {
  [key: string]: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: FormErrors;
}
