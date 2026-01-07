import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { LeaderboardEntry, Weight } from '../types';

// Local Storage Keys
const PROFILES_KEY = 'weighin_profiles_backup';
const WEIGHTS_KEY = 'weighin_weights_backup';
const LAST_SYNC_KEY = 'weighin_last_sync';

// Local Storage Interface
export interface LocalProfile {
  id: string;
  name: string;
  baseline_weight: number;
  goal_weight: number;
  created_at: string;
}

export interface LocalWeight {
  id: string;
  profile_id: string;
  current_weight: number;
  recorded_at: string;
}

export interface LocalData {
  profiles: LocalProfile[];
  weights: LocalWeight[];
  lastSync: string;
}

// Generate UUID for local entries
const generateId = (): string => {
  return 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// Local Storage Functions
export const localStorageService = {
  // Save data to localStorage
  saveProfiles: (profiles: LocalProfile[]): void => {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  },

  saveWeights: (weights: LocalWeight[]): void => {
    localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights));
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  },

  // Load data from localStorage
  getProfiles: (): LocalProfile[] => {
    const stored = localStorage.getItem(PROFILES_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  getWeights: (): LocalWeight[] => {
    const stored = localStorage.getItem(WEIGHTS_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  getLastSync: (): string | null => {
    return localStorage.getItem(LAST_SYNC_KEY);
  },

  // Add new entries
  addProfile: (name: string, baseline: number, goal: number): LocalProfile => {
    const profiles = localStorageService.getProfiles();
    const newProfile: LocalProfile = {
      id: generateId(),
      name,
      baseline_weight: baseline,
      goal_weight: goal,
      created_at: new Date().toISOString()
    };
    profiles.push(newProfile);
    localStorageService.saveProfiles(profiles);
    return newProfile;
  },

  addWeight: (profileId: string, weight: number, date?: string): LocalWeight => {
    const weights = localStorageService.getWeights();
    const newWeight: LocalWeight = {
      id: generateId(),
      profile_id: profileId,
      current_weight: weight,
      recorded_at: date || new Date().toISOString()
    };
    weights.push(newWeight);
    localStorageService.saveWeights(weights);
    return newWeight;
  },

  // Update entries
  updateProfile: (id: string, updates: Partial<LocalProfile>): boolean => {
    const profiles = localStorageService.getProfiles();
    const index = profiles.findIndex(p => p.id === id);
    if (index === -1) return false;
    
    profiles[index] = { ...profiles[index], ...updates };
    localStorageService.saveProfiles(profiles);
    return true;
  },

  updateWeight: (id: string, updates: Partial<LocalWeight>): boolean => {
    const weights = localStorageService.getWeights();
    const index = weights.findIndex(w => w.id === id);
    if (index === -1) return false;
    
    weights[index] = { ...weights[index], ...updates };
    localStorageService.saveWeights(weights);
    return true;
  },

  // Delete entries
  deleteProfile: (id: string): boolean => {
    const profiles = localStorageService.getProfiles();
    const filteredProfiles = profiles.filter(p => p.id !== id);
    if (filteredProfiles.length === profiles.length) return false;
    
    // Also delete associated weights
    const weights = localStorageService.getWeights();
    const filteredWeights = weights.filter(w => w.profile_id !== id);
    
    localStorageService.saveProfiles(filteredProfiles);
    localStorageService.saveWeights(filteredWeights);
    return true;
  },

  deleteWeight: (id: string): boolean => {
    const weights = localStorageService.getWeights();
    const filteredWeights = weights.filter(w => w.id !== id);
    if (filteredWeights.length === weights.length) return false;
    
    localStorageService.saveWeights(filteredWeights);
    return true;
  },

  // Clear all local data
  clearAll: (): void => {
    localStorage.removeItem(PROFILES_KEY);
    localStorage.removeItem(WEIGHTS_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
  },

  // Generate leaderboard from local data
  generateLeaderboard: (): LeaderboardEntry[] => {
    const profiles = localStorageService.getProfiles();
    const weights = localStorageService.getWeights();

    return profiles.map(profile => {
      // Get latest weight for this profile
      const profileWeights = weights
        .filter(w => w.profile_id === profile.id)
        .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
      
      const latestWeight = profileWeights[0];
      const currentWeight = latestWeight?.current_weight || profile.baseline_weight;
      const totalLost = profile.baseline_weight - currentWeight;
      
      const percentageToGoal = profile.baseline_weight === profile.goal_weight 
        ? 0 
        : Math.round((totalLost * 100) / (profile.baseline_weight - profile.goal_weight) * 100) / 100;

      return {
        id: profile.id,
        name: profile.name,
        baseline_weight: profile.baseline_weight,
        goal_weight: profile.goal_weight,
        current_weight: currentWeight,
        total_lost: totalLost,
        percentage_to_goal: percentageToGoal,
        last_recorded: latestWeight?.recorded_at || profile.created_at,
        created_at: profile.created_at
      };
    }).sort((a, b) => b.percentage_to_goal - a.percentage_to_goal);
  }
};

// Excel Export/Import Functions
export const excelService = {
  // Export data to Excel file
  exportToExcel: (): void => {
    const profiles = localStorageService.getProfiles();
    const weights = localStorageService.getWeights();
    const leaderboard = localStorageService.generateLeaderboard();

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Profiles sheet
    const profilesWS = XLSX.utils.json_to_sheet(profiles.map(p => ({
      ID: p.id,
      Name: p.name,
      'Baseline Weight (kg)': p.baseline_weight,
      'Goal Weight (kg)': p.goal_weight,
      'Created At': new Date(p.created_at).toLocaleDateString()
    })));
    XLSX.utils.book_append_sheet(workbook, profilesWS, 'Profiles');

    // Weights sheet
    const weightsWS = XLSX.utils.json_to_sheet(weights.map(w => ({
      ID: w.id,
      'Profile ID': w.profile_id,
      'Profile Name': profiles.find(p => p.id === w.profile_id)?.name || 'Unknown',
      'Weight (kg)': w.current_weight,
      'Recorded At': new Date(w.recorded_at).toLocaleDateString()
    })));
    XLSX.utils.book_append_sheet(workbook, weightsWS, 'Weight History');

    // Leaderboard sheet
    const leaderboardWS = XLSX.utils.json_to_sheet(leaderboard.map(entry => ({
      Name: entry.name,
      'Starting Weight': entry.baseline_weight,
      'Goal Weight': entry.goal_weight,
      'Current Weight': entry.current_weight,
      'Weight Lost': entry.total_lost,
      'Progress %': entry.percentage_to_goal,
      'Last Weigh-in': new Date(entry.last_recorded).toLocaleDateString()
    })));
    XLSX.utils.book_append_sheet(workbook, leaderboardWS, 'Leaderboard');

    // Generate and download file
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `weigh-in-data-${timestamp}.xlsx`;
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, fileName);
  },

  // Import data from Excel file
  importFromExcel: (file: File): Promise<LocalData> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          const profilesSheet = workbook.Sheets['Profiles'];
          const weightsSheet = workbook.Sheets['Weight History'];
          
          if (!profilesSheet || !weightsSheet) {
            throw new Error('Required sheets (Profiles, Weight History) not found in Excel file');
          }

          const profilesData = XLSX.utils.sheet_to_json(profilesSheet);
          const weightsData = XLSX.utils.sheet_to_json(weightsSheet);

          // Convert to LocalProfile format
          const profiles: LocalProfile[] = profilesData.map((row: any) => ({
            id: row.ID || generateId(),
            name: row.Name,
            baseline_weight: parseFloat(row['Baseline Weight (kg)']),
            goal_weight: parseFloat(row['Goal Weight (kg)']),
            created_at: new Date(row['Created At']).toISOString()
          }));

          // Convert to LocalWeight format
          const weights: LocalWeight[] = weightsData.map((row: any) => ({
            id: row.ID || generateId(),
            profile_id: row['Profile ID'],
            current_weight: parseFloat(row['Weight (kg)']),
            recorded_at: new Date(row['Recorded At']).toISOString()
          }));

          resolve({
            profiles,
            weights,
            lastSync: new Date().toISOString()
          });
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsBinaryString(file);
    });
  },

  // Replace local data with imported data
  replaceLocalData: async (file: File): Promise<void> => {
    const importedData = await excelService.importFromExcel(file);
    
    // Clear existing data
    localStorageService.clearAll();
    
    // Save imported data
    localStorageService.saveProfiles(importedData.profiles);
    localStorageService.saveWeights(importedData.weights);
  }
};

// Utility to check if we should use local storage (when Supabase is down)
export const shouldUseLocalStorage = async (): Promise<boolean> => {
  try {
    // Try a simple request to Supabase to check if it's available
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      }
    });
    return !response.ok;
  } catch {
    return true; // Use local storage if request fails
  }
};