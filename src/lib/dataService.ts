import { supabase } from './supabase';
import { localStorageService, shouldUseLocalStorage, excelService } from './localStorage';
import type { LeaderboardEntry, Weight } from '../types';

export interface DataService {
  isOnline: boolean;
  fetchLeaderboard: () => Promise<LeaderboardEntry[]>;
  addProfile: (name: string, baseline: number, goal: number) => Promise<any>;
  addWeight: (profileId: string, weight: number, date?: string) => Promise<any>;
  updateProfile: (id: string, updates: any) => Promise<any>;
  updateWeight: (id: string, updates: any) => Promise<any>;
  deleteProfile: (id: string) => Promise<any>;
  deleteWeight: (id: string) => Promise<any>;
  exportData: () => void;
  importData: (file: File) => Promise<void>;
  switchMode: (useLocal: boolean) => void;
}

class HybridDataService implements DataService {
  public isOnline: boolean = true;
  private forceLocal: boolean = false;

  constructor() {
    this.checkConnection();
  }

  private async checkConnection(): Promise<void> {
    if (this.forceLocal) {
      this.isOnline = false;
      return;
    }

    try {
      this.isOnline = !(await shouldUseLocalStorage());
    } catch {
      this.isOnline = false;
    }
  }

  public switchMode(useLocal: boolean): void {
    this.forceLocal = useLocal;
    this.isOnline = !useLocal;
  }

  async fetchLeaderboard(): Promise<LeaderboardEntry[]> {
    await this.checkConnection();

    if (!this.isOnline) {
      // Use local storage
      return localStorageService.generateLeaderboard();
    }

    try {
      // Use Supabase
      const { data, error } = await supabase.from('leaderboard').select('*');
      if (error) throw error;
      
      // Backup to local storage for future offline use
      if (data && data.length > 0) {
        // Convert leaderboard entries back to profiles and weights for local storage
        const profiles = data.map(entry => ({
          id: entry.id,
          name: entry.name,
          baseline_weight: entry.baseline_weight,
          goal_weight: entry.goal_weight,
          created_at: entry.created_at
        }));
        localStorageService.saveProfiles(profiles);
      }
      
      return data || [];
    } catch (error) {
      console.warn('Supabase failed, falling back to local storage:', error);
      this.isOnline = false;
      return localStorageService.generateLeaderboard();
    }
  }

  async addProfile(name: string, baseline: number, goal: number): Promise<any> {
    await this.checkConnection();

    if (!this.isOnline) {
      // Use local storage
      return localStorageService.addProfile(name, baseline, goal);
    }

    try {
      // Use Supabase
      const { data, error } = await supabase
        .from('profiles')
        .insert([{
          name: name.trim(),
          baseline_weight: baseline,
          goal_weight: goal
        }])
        .select()
        .single();

      if (error) throw error;

      // Backup to local storage
      localStorageService.addProfile(name, baseline, goal);
      
      return data;
    } catch (error) {
      console.warn('Supabase failed, using local storage:', error);
      this.isOnline = false;
      return localStorageService.addProfile(name, baseline, goal);
    }
  }

  async addWeight(profileId: string, weight: number, date?: string): Promise<any> {
    await this.checkConnection();

    if (!this.isOnline) {
      // Use local storage
      return localStorageService.addWeight(profileId, weight, date);
    }

    try {
      // Use Supabase
      const { data, error } = await supabase
        .from('weights')
        .insert([{
          profile_id: profileId,
          current_weight: weight,
          recorded_at: date || new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      // Backup to local storage
      localStorageService.addWeight(profileId, weight, date);
      
      return data;
    } catch (error) {
      console.warn('Supabase failed, using local storage:', error);
      this.isOnline = false;
      return localStorageService.addWeight(profileId, weight, date);
    }
  }

  async updateProfile(id: string, updates: any): Promise<any> {
    await this.checkConnection();

    if (!this.isOnline) {
      // Use local storage
      const success = localStorageService.updateProfile(id, updates);
      if (!success) throw new Error('Profile not found');
      return { id, ...updates };
    }

    try {
      // Use Supabase
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Backup to local storage
      localStorageService.updateProfile(id, updates);
      
      return data;
    } catch (error) {
      console.warn('Supabase failed, using local storage:', error);
      this.isOnline = false;
      const success = localStorageService.updateProfile(id, updates);
      if (!success) throw error;
      return { id, ...updates };
    }
  }

  async updateWeight(id: string, updates: any): Promise<any> {
    await this.checkConnection();

    if (!this.isOnline) {
      // Use local storage
      const success = localStorageService.updateWeight(id, updates);
      if (!success) throw new Error('Weight entry not found');
      return { id, ...updates };
    }

    try {
      // Use Supabase
      const { data, error } = await supabase
        .from('weights')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Backup to local storage
      localStorageService.updateWeight(id, updates);
      
      return data;
    } catch (error) {
      console.warn('Supabase failed, using local storage:', error);
      this.isOnline = false;
      const success = localStorageService.updateWeight(id, updates);
      if (!success) throw error;
      return { id, ...updates };
    }
  }

  async deleteProfile(id: string): Promise<any> {
    await this.checkConnection();

    if (!this.isOnline) {
      // Use local storage
      const success = localStorageService.deleteProfile(id);
      if (!success) throw new Error('Profile not found');
      return { id };
    }

    try {
      // Use Supabase
      const { error: weightsError } = await supabase
        .from('weights')
        .delete()
        .eq('profile_id', id);

      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', id);

      if (weightsError || profileError) throw weightsError || profileError;

      // Backup to local storage
      localStorageService.deleteProfile(id);
      
      return { id };
    } catch (error) {
      console.warn('Supabase failed, using local storage:', error);
      this.isOnline = false;
      const success = localStorageService.deleteProfile(id);
      if (!success) throw error;
      return { id };
    }
  }

  async deleteWeight(id: string): Promise<any> {
    await this.checkConnection();

    if (!this.isOnline) {
      // Use local storage
      const success = localStorageService.deleteWeight(id);
      if (!success) throw new Error('Weight entry not found');
      return { id };
    }

    try {
      // Use Supabase
      const { error } = await supabase
        .from('weights')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Backup to local storage
      localStorageService.deleteWeight(id);
      
      return { id };
    } catch (error) {
      console.warn('Supabase failed, using local storage:', error);
      this.isOnline = false;
      const success = localStorageService.deleteWeight(id);
      if (!success) throw error;
      return { id };
    }
  }

  exportData(): void {
    excelService.exportToExcel();
  }

  async importData(file: File): Promise<void> {
    await excelService.replaceLocalData(file);
  }
}

// Create singleton instance
export const dataService = new HybridDataService();