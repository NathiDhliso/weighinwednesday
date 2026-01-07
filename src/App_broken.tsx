import { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { Trophy, Lock, Share2, Plus, LogOut, TrendingDown, Users, X, Edit2, Trash2, Award, Calendar, Download, AlertTriangle, CheckCircle, AlertCircle, FolderOpen, Settings } from 'lucide-react';
import type { LeaderboardEntry, Weight, Notification, Achievement, FormErrors, ValidationResult } from './types';
import NotificationStack from './components/NotificationStack';
import Header from './components/Header';
import LeaderboardCard from './components/LeaderboardCard';
import Modal from './components/Modal';
import FloatingActions from './components/FloatingActions';
import FormField from './components/FormField';

const ADMIN_PASSWORD = 'weighttracker2026';
const WEIGHT_MIN = 30;
const WEIGHT_MAX = 300;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 30;

const parseWeight = (value: string): number => {
  return parseFloat(value.toString().replace(',', '.'));
};

const validateWeight = (weight: string): ValidationResult => {
  const errors: FormErrors = {};
  if (!weight.trim()) {
    errors.weight = 'Weight is required';
  } else {
    const parsed = parseWeight(weight);
    if (isNaN(parsed)) {
      errors.weight = 'Please enter a valid number';
    } else if (parsed < WEIGHT_MIN || parsed > WEIGHT_MAX) {
      errors.weight = `Weight must be between ${WEIGHT_MIN}-${WEIGHT_MAX}kg`;
    }
  }
  return { isValid: Object.keys(errors).length === 0, errors };
};

const validateName = (name: string, existingNames: string[] = [], currentName?: string): ValidationResult => {
  const errors: FormErrors = {};
  const trimmedName = name.trim();
  
  if (!trimmedName) {
    errors.name = 'Name is required';
  } else if (trimmedName.length < MIN_NAME_LENGTH) {
    errors.name = `Name must be at least ${MIN_NAME_LENGTH} characters`;
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `Name cannot exceed ${MAX_NAME_LENGTH} characters`;
  } else if (!/^[a-zA-Z\s'-]+$/.test(trimmedName)) {
    errors.name = 'Name can only contain letters, spaces, hyphens and apostrophes';
  } else if (existingNames.some(n => n.toLowerCase() === trimmedName.toLowerCase() && n !== currentName)) {
    errors.name = 'This name is already taken';
  }
  
  return { isValid: Object.keys(errors).length === 0, errors };
};

const validateDate = (dateStr: string): ValidationResult => {
  const errors: FormErrors = {};
  const date = new Date(dateStr);
  const today = new Date();
  const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  
  if (isNaN(date.getTime())) {
    errors.date = 'Please enter a valid date';
  } else if (date > today) {
    errors.date = 'Date cannot be in the future';
  } else if (date < oneYearAgo) {
    errors.date = 'Date cannot be more than 1 year ago';
  }
  
  return { isValid: Object.keys(errors).length === 0, errors };
};

const achievements: Achievement[] = [
  {
    id: 'first-weigh-in',
    title: 'Getting Started',
    description: 'Logged your first weight',
    icon: '🎯',
    criteria: (_, history) => history.length >= 1
  },
  {
    id: 'consistent-tracker',
    title: 'Consistency Champion',
    description: '7 consecutive weigh-ins',
    icon: '🔥',
    criteria: (_, history) => history.length >= 7
  },
  {
    id: 'quarter-goal',
    title: '25% Progress',
    description: 'Reached 25% of your goal',
    icon: '🌟',
    criteria: (profile) => (profile.percentage_lost || 0) >= 25
  },
  {
    id: 'halfway-hero',
    title: 'Halfway Hero',
    description: 'Reached 50% of your goal',
    icon: '💪',
    criteria: (profile) => (profile.percentage_lost || 0) >= 50
  },
  {
    id: 'goal-crusher',
    title: 'Goal Crusher',
    description: 'Achieved your weight goal!',
    icon: '👑',
    criteria: (profile) => (profile.percentage_lost || 0) >= 100
  },
  {
    id: 'big-loss',
    title: 'Major Milestone',
    description: 'Lost 10kg or more',
    icon: '🏆',
    criteria: (profile) => (profile.weight_lost || 0) >= 10
  }
];

function App() {
  const [profiles, setProfiles] = useState<LeaderboardEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showAddWeight, setShowAddWeight] = useState(false);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [showProfileDetail, setShowProfileDetail] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showEditWeight, setShowEditWeight] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showWeeklySummary, setShowWeeklySummary] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<LeaderboardEntry | null>(null);
  const [selectedWeight, setSelectedWeight] = useState<Weight | null>(null);
  const [profileHistory, setProfileHistory] = useState<Weight[]>([]);
  const [passwordInput, setPasswordInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [newWeight, setNewWeight] = useState({ profile_id: '', weight: '', date: '' });
  const [newProfile, setNewProfile] = useState({ name: '', baseline: '', goal: '' });
  const [editProfile, setEditProfile] = useState({ name: '', baseline: '', goal: '' });
  const [editWeight, setEditWeight] = useState({ weight: '', date: '' });
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete-profile' | 'delete-weight'; title: string; message: string; action: () => void } | null>(null);
  
  // Auto-save Excel settings
  const [backupPath, setBackupPath] = useState(() => {
    return localStorage.getItem('weighin_backup_path') || '';
  });
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(() => {
    return localStorage.getItem('weighin_auto_backup') === 'true';
  });
  const [showBackupSettings, setShowBackupSettings] = useState(false);

  const addNotification = useCallback((type: Notification['type'], message: string, duration = 5000) => {
    const notification: Notification = {
      id: Date.now().toString(),
      type,
      message,
      timestamp: Date.now(),
      duration
    };
    setNotifications(prev => [...prev, notification]);
    
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(notification.id);
      }, duration);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const checkAchievements = useCallback((profile: LeaderboardEntry, history: Weight[]) => {
    achievements.forEach(achievement => {
      if (achievement.criteria(profile, history)) {
        const alreadyNotified = notifications.some(n => n.message.includes(achievement.title));
        if (!alreadyNotified) {
          addNotification('achievement', `🎉 ${profile.name} unlocked: ${achievement.title}!`, 8000);
        }
      }
    });
  }, [notifications, addNotification]);

  const checkForDuplicate = useCallback(async (profileId: string, date: string): Promise<boolean> => {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      const { data } = await supabase
        .from('weights')
        .select('id')
        .eq('profile_id', profileId)
        .gte('recorded_at', startOfDay.toISOString())
        .lte('recorded_at', endOfDay.toISOString());

      return (data?.length || 0) > 0;
    } catch {
      return false; // If check fails, allow the entry
    }
  }, []);

  const exportData = useCallback(() => {
    const data = {
      profiles: profiles.map(p => ({
        name: p.name,
        baseline_weight: p.baseline_weight,
        goal_weight: p.goal_weight,
        current_weight: p.current_weight,
        weight_lost: p.weight_lost,
        percentage_lost: p.percentage_lost,
        last_weigh_in: p.last_weigh_in
      })),
      export_date: new Date().toISOString(),
      total_participants: profiles.length
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weigh-in-wednesday-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addNotification('success', 'Data exported successfully!');
  }, [profiles, addNotification]);

  // New auto-backup functions
  const saveBackupPath = (path: string) => {
    setBackupPath(path);
    localStorage.setItem('weighin_backup_path', path);
  };

  const toggleAutoBackup = (enabled: boolean) => {
    setAutoBackupEnabled(enabled);
    localStorage.setItem('weighin_auto_backup', enabled.toString());
  };

  const createExcelBackup = async () => {
    try {
      // Get all data
      const { data: leaderboardData } = await supabase.from('leaderboard').select('*');
      const { data: weightsData } = await supabase.from('weights').select('*');
      
      // Create workbook
      const workbook = XLSX.utils.book_new();

      // Profiles sheet (from leaderboard data)
      if (leaderboardData) {
        const profilesWS = XLSX.utils.json_to_sheet(leaderboardData.map(p => ({
          ID: p.id,
          Name: p.name,
          'Baseline Weight (kg)': p.baseline_weight,
          'Goal Weight (kg)': p.goal_weight,
          'Current Weight (kg)': p.current_weight,
          'Weight Lost (kg)': p.total_lost,
          'Progress %': p.percentage_to_goal,
          'Last Weigh-in': new Date(p.last_recorded).toLocaleDateString(),
          'Created At': new Date(p.created_at).toLocaleDateString()
        })));
        XLSX.utils.book_append_sheet(workbook, profilesWS, 'Current Standings');
      }

      // Weight History sheet
      if (weightsData && weightsData.length > 0) {
        const weightsWS = XLSX.utils.json_to_sheet(weightsData.map(w => ({
          'Profile Name': leaderboardData?.find(p => p.id === w.profile_id)?.name || 'Unknown',
          'Weight (kg)': w.current_weight,
          'Recorded Date': new Date(w.recorded_at).toLocaleDateString(),
          'Recorded Time': new Date(w.recorded_at).toLocaleTimeString(),
          'Profile ID': w.profile_id
        })).sort((a, b) => new Date(b['Recorded Date']).getTime() - new Date(a['Recorded Date']).getTime()));
        XLSX.utils.book_append_sheet(workbook, weightsWS, 'Weight History');
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const filename = `WeighIn-Wednesday-${timestamp}.xlsx`;
      
      return { workbook, filename };
    } catch (error) {
      console.error('Error creating backup:', error);
      throw error;
    }
  };

  const downloadExcelBackup = async () => {
    try {
      const { workbook, filename } = await createExcelBackup();
      
      // Convert to blob and download
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      addNotification('success', `📊 Excel backup downloaded: ${filename}`);
    } catch (error) {
      addNotification('error', 'Failed to create Excel backup');
    }
  };

  const autoSaveBackup = async () => {
    if (!autoBackupEnabled || !backupPath.trim()) return;
    
    try {
      const { workbook, filename } = await createExcelBackup();
      
      // In a real browser environment, we can't directly save to file system
      // So we'll save to Downloads and show instructions to move it
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      addNotification('info', `💾 Auto-backup saved to Downloads. Move to: ${backupPath}`, 8000);
    } catch (error) {
      console.error('Auto-backup failed:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('leaderboard').select('*');
      if (error) throw error;
      setProfiles(data || []);
      
      // Auto-backup after data loads (if enabled)
      if (autoBackupEnabled) {
        setTimeout(autoSaveBackup, 2000); // Delay to avoid blocking UI
      }
    } catch (error) {
      console.error('Error:', error);
      addNotification('error', 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const subscription = supabase
      .channel('weights_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weights' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchData)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormErrors({});
    
    try {
      if (!newWeight.profile_id) {
        setFormErrors({ profile_id: 'Please select a participant' });
        return;
      }
      
      const weightValidation = validateWeight(newWeight.weight);
      if (!weightValidation.isValid) {
        setFormErrors(weightValidation.errors);
        return;
      }
      
      const dateToUse = newWeight.date || new Date().toISOString();
      if (newWeight.date) {
        const dateValidation = validateDate(newWeight.date);
        if (!dateValidation.isValid) {
          setFormErrors(dateValidation.errors);
          return;
        }
      }
      
      const isDuplicate = await checkForDuplicate(newWeight.profile_id, dateToUse);
      if (isDuplicate) {
        setFormErrors({ weight: 'A weight entry already exists for this date. Please edit the existing entry or choose a different date.' });
        return;
      }

      const { error } = await supabase
        .from('weights')
        .insert([{
          profile_id: newWeight.profile_id,
          current_weight: parseWeight(newWeight.weight),
          recorded_at: dateToUse
        }]);

      if (error) throw error;
      
      const profile = profiles.find(p => p.id === newWeight.profile_id);
      addNotification('success', `Weight logged for ${profile?.name}!`);
      
      // Check achievements
      if (profile) {
        const history = await fetchProfileHistory(profile.id);
        checkAchievements(profile, history);
      }
      
      setShowAddWeight(false);
      setNewWeight({ profile_id: '', weight: '', date: '' });
      fetchData();
    } catch (error: any) {
      addNotification('error', `Failed to add weight: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormErrors({});
    
    try {
      const nameValidation = validateName(newProfile.name, profiles.map(p => p.name));
      const baselineValidation = validateWeight(newProfile.baseline);
      const goalValidation = validateWeight(newProfile.goal);
      
      const errors = {
        ...nameValidation.errors,
        baseline: baselineValidation.errors.weight,
        goal: goalValidation.errors.weight
      };
      
      // Additional validation: goal should be less than baseline for weight loss
      if (baselineValidation.isValid && goalValidation.isValid) {
        const baselineNum = parseWeight(newProfile.baseline);
        const goalNum = parseWeight(newProfile.goal);
        if (goalNum >= baselineNum) {
          errors.goal = 'Goal weight should be less than starting weight';
        }
      }
      
      if (Object.values(errors).some(Boolean)) {
        setFormErrors(errors);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .insert([{
          name: newProfile.name.trim(),
          baseline_weight: parseWeight(newProfile.baseline),
          goal_weight: parseWeight(newProfile.goal)
        }]);

      if (error) throw error;
      
      addNotification('success', `Profile created for ${newProfile.name}!`);
      setShowAddProfile(false);
      setNewProfile({ name: '', baseline: '', goal: '' });
      fetchData();
    } catch (error: any) {
      addNotification('error', `Failed to create profile: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile) return;
    
    setSubmitting(true);
    setFormErrors({});
    
    try {
      const nameValidation = validateName(editProfile.name, profiles.map(p => p.name), selectedProfile.name);
      const baselineValidation = validateWeight(editProfile.baseline);
      const goalValidation = validateWeight(editProfile.goal);
      
      const errors = {
        ...nameValidation.errors,
        baseline: baselineValidation.errors.weight,
        goal: goalValidation.errors.weight
      };
      
      if (baselineValidation.isValid && goalValidation.isValid) {
        const baselineNum = parseWeight(editProfile.baseline);
        const goalNum = parseWeight(editProfile.goal);
        if (goalNum >= baselineNum) {
          errors.goal = 'Goal weight should be less than starting weight';
        }
      }
      
      if (Object.values(errors).some(Boolean)) {
        setFormErrors(errors);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          name: editProfile.name.trim(),
          baseline_weight: parseWeight(editProfile.baseline),
          goal_weight: parseWeight(editProfile.goal)
        })
        .eq('id', selectedProfile.id);

      if (error) throw error;
      
      addNotification('success', `Profile updated for ${editProfile.name}!`);
      setShowEditProfile(false);
      fetchData();
    } catch (error: any) {
      addNotification('error', `Failed to update profile: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWeight) return;
    
    setSubmitting(true);
    setFormErrors({});
    
    try {
      const weightValidation = validateWeight(editWeight.weight);
      if (!weightValidation.isValid) {
        setFormErrors(weightValidation.errors);
        return;
      }
      
      const dateValidation = validateDate(editWeight.date);
      if (!dateValidation.isValid) {
        setFormErrors(dateValidation.errors);
        return;
      }

      const { error } = await supabase
        .from('weights')
        .update({
          current_weight: parseWeight(editWeight.weight),
          recorded_at: new Date(editWeight.date).toISOString()
        })
        .eq('id', selectedWeight.id);

      if (error) throw error;
      
      addNotification('success', 'Weight entry updated!');
      setShowEditWeight(false);
      if (selectedProfile) {
        await fetchProfileHistory(selectedProfile.id);
      }
      fetchData();
    } catch (error: any) {
      addNotification('error', `Failed to update weight: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!selectedProfile) return;
    
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', selectedProfile.id);

      if (error) throw error;
      
      addNotification('success', `Profile deleted for ${selectedProfile.name}`);
      setShowConfirmDialog(false);
      setShowProfileDetail(false);
      fetchData();
    } catch (error: any) {
      addNotification('error', `Failed to delete profile: ${error.message}`);
    }
  };

  const handleDeleteWeight = async () => {
    if (!selectedWeight) return;
    
    try {
      const { error } = await supabase
        .from('weights')
        .delete()
        .eq('id', selectedWeight.id);

      if (error) throw error;
      
      addNotification('success', 'Weight entry deleted!');
      setShowConfirmDialog(false);
      if (selectedProfile) {
        await fetchProfileHistory(selectedProfile.id);
      }
      fetchData();
    } catch (error: any) {
      addNotification('error', `Failed to delete weight: ${error.message}`);
    }
  };

  const shareStats = () => {
    const top3 = profiles.slice(0, 3).filter(p => p.percentage_lost);
    const biggestLoser = [...profiles]
      .filter(p => p.weight_lost && p.weight_lost > 0)
      .sort((a, b) => (b.weight_lost || 0) - (a.weight_lost || 0))[0];

    let text = `🏆 *WEIGH-IN WEDNESDAY RESULTS*\n\n`;

    if (biggestLoser) {
      text += `🔥 *Biggest Overall Loser:* ${biggestLoser.name} (-${biggestLoser.weight_lost?.toFixed(1)}kg)\n\n`;
    }

    text += `📊 *Top 3 Progress Leaders:*\n`;
    top3.forEach((p, i) => {
      const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
      text += `${emoji} ${p.name}: ${p.percentage_lost}% (${Math.abs(p.weight_lost || 0).toFixed(1)}kg lost)\n`;
    });

    text += `\n💪 Keep crushing it, team!`;

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const fetchProfileHistory = async (profileId: string): Promise<Weight[]> => {
    try {
      const { data, error } = await supabase
        .from('weights')
        .select('*')
        .eq('profile_id', profileId)
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      
      const history = data || [];
      setProfileHistory(history);
      return history;
    } catch (error) {
      console.error('Error fetching history:', error);
      addNotification('error', 'Failed to load weight history');
      return [];
    }
  };

  const openProfileDetail = async (person: LeaderboardEntry) => {
    setSelectedProfile(person);
    const history = await fetchProfileHistory(person.id);
    checkAchievements(person, history);
    setShowProfileDetail(true);
  };

  const openEditProfile = (profile: LeaderboardEntry) => {
    setSelectedProfile(profile);
    setEditProfile({
      name: profile.name,
      baseline: profile.baseline_weight.toString(),
      goal: profile.goal_weight.toString()
    });
    setShowEditProfile(true);
    setFormErrors({});
  };

  const openEditWeight = (weight: Weight) => {
    setSelectedWeight(weight);
    setEditWeight({
      weight: weight.current_weight.toString(),
      date: new Date(weight.recorded_at).toISOString().split('T')[0]
    });
    setShowEditWeight(true);
    setFormErrors({});
  };

  const openConfirmDialog = (type: 'delete-profile' | 'delete-weight', item: LeaderboardEntry | Weight) => {
    if (type === 'delete-profile') {
      const profile = item as LeaderboardEntry;
      setSelectedProfile(profile);
      setConfirmAction({
        type,
        title: 'Delete Profile',
        message: `Are you sure you want to delete ${profile.name}'s profile? This will permanently remove all their weight entries and cannot be undone.`,
        action: handleDeleteProfile
      });
    } else {
      const weight = item as Weight;
      setSelectedWeight(weight);
      setConfirmAction({
        type,
        title: 'Delete Weight Entry',
        message: `Are you sure you want to delete this weight entry? This action cannot be undone.`,
        action: handleDeleteWeight
      });
    }
    setShowConfirmDialog(true);
  };

  const getStreakCount = (history: Weight[]): number => {
    if (history.length === 0) return 0;
    
    let streak = 1;
    const sortedHistory = [...history].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
    
    for (let i = 1; i < sortedHistory.length; i++) {
      const current = new Date(sortedHistory[i].recorded_at);
      const previous = new Date(sortedHistory[i - 1].recorded_at);
      const daysDiff = Math.abs(current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysDiff <= 8) { // Allow up to 8 days between weigh-ins
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  };

  const generateWeeklySummary = () => {
    const summary = profiles.map(profile => {
      const streak = getStreakCount(profileHistory);
      const unlockedAchievements = achievements.filter(a => a.criteria(profile, profileHistory));
      
      return {
        ...profile,
        streak,
        unlockedAchievements
      };
    });
    
    return summary;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white font-sans">
      <NotificationStack 
        notifications={notifications}
        onRemoveNotification={removeNotification}
      />

<Header profiles={profiles}>
        {isAdmin && (
          <>
            <button
              onClick={() => setShowBackupSettings(!showBackupSettings)}
              className="p-2 sm:p-3 bg-slate-700 rounded-full backdrop-blur-md hover:scale-110 transition-transform shadow-lg"
              title="Backup Settings"
            >
              <Settings size={16} />
            </button>

              {showBackupSettings && (
                <div className="absolute top-12 sm:top-16 right-0 bg-slate-800 border border-slate-600 rounded-xl p-3 sm:p-4 shadow-2xl z-50 w-80 max-w-[calc(100vw-2rem)] sm:min-w-80">
                  <div className="space-y-3 sm:space-y-4">
                    <h3 className="text-white font-bold flex items-center gap-2">
                      <FolderOpen size={16} />
                      Auto-Backup Settings
                    </h3>
                    
                    <div>
                      <label className="block text-slate-300 text-sm mb-2">
                        Backup Folder Path:
                      </label>
                      <input
                        type="text"
                        value={backupPath}
                        onChange={(e) => saveBackupPath(e.target.value)}
                        placeholder="e.g., C:\Documents\WeighInWedData"
                        className="w-full p-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                      />
                      <p className="text-slate-400 text-xs mt-1">
                        💡 Files will download to your Downloads folder. Move them here manually.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="autoBackup"
                        checked={autoBackupEnabled}
                        onChange={(e) => toggleAutoBackup(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <label htmlFor="autoBackup" className="text-slate-300 text-sm">
                        Auto-backup after data changes
                      </label>
                    </div>

                    <div className="border-t border-slate-600 pt-3">
                      <button
                        onClick={downloadExcelBackup}
                        className="w-full p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                      >
                        <Download size={16} />
                        Download Excel Backup Now
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={exportData}
                className="p-3 bg-slate-700 rounded-full backdrop-blur-md hover:scale-110 transition-transform shadow-lg"
                title="Export Data"
              >
                <Download size={20} />
              </button>
              <button
                onClick={() => setShowWeeklySummary(true)}
                className="p-3 bg-purple-600 rounded-full backdrop-blur-md hover:scale-110 transition-transform shadow-lg"
                title="Weekly Summary"
              >
                <Calendar size={20} />
              </button>
            </>
          )}
          <button
            onClick={() => setShowAchievements(true)}
            className="p-3 bg-yellow-600 rounded-full backdrop-blur-md hover:scale-110 transition-transform shadow-lg"
            title="Achievements"
          >
            <Award size={20} />
          </button>
          <button
            onClick={shareStats}
            className="p-3 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full backdrop-blur-md hover:scale-110 transition-transform shadow-lg shadow-emerald-500/20"
            title="Share Stats"
          >
            <Share2 size={20} />
          </button>
      </Header>

      <main className="container-main space-y-3 sm:space-y-4 mb-24 sm:mb-32">
        {loading ? (
          <div className="text-center py-12 sm:py-20 text-slate-400">Loading...</div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-12 sm:py-20">
            <Trophy size={64} className="mx-auto mb-4 opacity-20" />
            <p className="text-slate-400">No participants yet. Add profiles to get started!</p>
            {isAdmin && (
              <button
                onClick={() => setShowAddProfile(true)}
                className="btn-primary mt-4"
              >
                Add First Profile
              </button>
            )}
          </div>
        ) : (
          profiles.map((person, index) => (
            <LeaderboardCard
              key={person.id}
              person={person}
              index={index}
              onClick={openProfileDetail}
            />
          ))
        )}
            const isTopThree = index < 3;
            const rankColors = ['from-yellow-500 to-amber-600', 'from-slate-300 to-slate-400', 'from-amber-700 to-amber-800'];

            return (
              <div
                key={person.id}
                onClick={() => openProfileDetail(person)}
                className={`relative overflow-hidden p-4 sm:p-6 rounded-xl sm:rounded-2xl border backdrop-blur-xl transition-all hover:scale-[1.01] sm:hover:scale-[1.02] cursor-pointer ${
                  index === 0
                    ? 'bg-yellow-500/10 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.2)] sm:shadow-[0_0_30px_rgba(234,179,8,0.3)]'
                    : isTopThree
                    ? 'bg-white/10 border-white/20'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                {index === 0 && (
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 via-transparent to-yellow-500/5 animate-pulse" />
                )}

                <div className="relative flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0">
                  <div className="flex items-center gap-3 sm:gap-4">
                    {isTopThree ? (
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br ${rankColors[index]} flex items-center justify-center text-xl sm:text-2xl shadow-lg flex-shrink-0`}>
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                      </div>
                    ) : (
                      <span className="w-10 sm:w-12 text-center text-2xl sm:text-3xl font-black italic opacity-30 flex-shrink-0">#{index + 1}</span>
                    )}

                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg sm:text-xl font-bold truncate">{person.name}</h3>
                      <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 text-xs sm:text-sm text-slate-400 mt-1">
                        <span>Current: <span className="text-white font-mono">{person.current_weight || '--'}kg</span></span>
                        <span>Lost: <span className="text-emerald-400 font-mono">-{person.weight_lost?.toFixed(1) || '0'}kg</span></span>
                      </div>
                    </div>
                  </div>

                  <div className="text-center sm:text-right sm:flex-shrink-0">
                    <div className="text-2xl sm:text-3xl font-mono font-black bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                      {person.percentage_lost?.toFixed(1) || '0'}%
                    </div>
                    <div className="text-xs text-slate-400 uppercase tracking-widest">Progress</div>
                  </div>
                </div>

                <div className="mt-3 sm:mt-4 h-2 sm:h-3 bg-white/5 rounded-full overflow-hidden backdrop-blur-sm border border-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-400 transition-all duration-1000 ease-out relative"
                    style={{ width: `${Math.min(Math.max(person.percentage_lost || 0, 0), 100)}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                  </div>
                </div>

                <div className="mt-2 flex justify-between text-xs sm:text-xs text-slate-500">
                  <span>Start: {person.baseline_weight}kg</span>
                  <span>Goal: {person.goal_weight}kg</span>
                </div>
              </div>
            );
          })
        )}
      </main>

      <FloatingActions
        isAdmin={isAdmin}
        onAddWeight={() => setShowAddWeight(true)}
        onAddProfile={() => setShowAddProfile(true)}
        onAdminToggle={() => isAdmin ? setIsAdmin(false) : setShowLogin(true)}
      />

      {showLogin && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800/90 p-8 rounded-2xl border border-white/20 w-full max-w-md backdrop-blur-xl shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <Lock size={24} className="text-blue-400" />
              <h2 className="text-2xl font-bold">Admin Access</h2>
            </div>
            <input
              type="password"
              className="w-full p-4 rounded-lg bg-white/5 border border-white/10 mb-4 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              placeholder="Enter password..."
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  if(passwordInput === ADMIN_PASSWORD) {
                    setIsAdmin(true);
                    setShowLogin(false);
                    setPasswordInput('');
                  } else {
                    alert('Wrong password');
                  }
                }
              }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if(passwordInput === ADMIN_PASSWORD) {
                    setIsAdmin(true);
                    setShowLogin(false);
                    setPasswordInput('');
                  } else {
                    alert('Wrong password');
                  }
                }}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 py-3 rounded-lg font-bold hover:scale-105 transition"
              >
                Unlock
              </button>
              <button
                onClick={() => { setShowLogin(false); setPasswordInput(''); }}
                className="flex-1 bg-white/5 py-3 rounded-lg hover:bg-white/10 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddWeight && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddWeight} className="bg-slate-900 border border-white/20 p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <TrendingDown className="text-emerald-400" /> Log New Weight
            </h2>

            <label className="block text-sm text-slate-400 mb-2">Select Participant</label>
            <select
              className={`w-full p-4 rounded-xl bg-white/5 border mb-4 focus:ring-2 outline-none transition ${
                formErrors.profile_id ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-blue-500'
              }`}
              value={newWeight.profile_id}
              onChange={(e) => setNewWeight({...newWeight, profile_id: e.target.value})}
              required
            >
              <option value="" className="bg-slate-900">-- Choose Friend --</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>
              ))}
            </select>
            {formErrors.profile_id && <p className="text-red-400 text-sm mb-4">{formErrors.profile_id}</p>}

            <label className="block text-sm text-slate-400 mb-2">Current Weight (kg)</label>
            <input
              type="text"
              className={`w-full p-4 rounded-xl bg-white/5 border mb-2 outline-none focus:ring-2 transition ${
                formErrors.weight ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-emerald-500'
              }`}
              placeholder="0.0 or 0,0"
              value={newWeight.weight}
              onChange={(e) => setNewWeight({...newWeight, weight: e.target.value})}
              required
            />
            {formErrors.weight && <p className="text-red-400 text-sm mb-4">{formErrors.weight}</p>}
            
            <label className="block text-sm text-slate-400 mb-2">Date (optional - defaults to today)</label>
            <input
              type="date"
              className={`w-full p-4 rounded-xl bg-white/5 border mb-6 outline-none focus:ring-2 transition ${
                formErrors.date ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-emerald-500'
              }`}
              value={newWeight.date}
              onChange={(e) => setNewWeight({...newWeight, date: e.target.value})}
            />
            {formErrors.date && <p className="text-red-400 text-sm mb-4">{formErrors.date}</p>}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className={`flex-1 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                  submitting 
                    ? 'bg-gray-600 cursor-not-allowed' 
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  'Save Entry'
                )}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setShowAddWeight(false);
                  setNewWeight({ profile_id: '', weight: '', date: '' });
                  setFormErrors({});
                }}
                className="flex-1 bg-white/5 hover:bg-white/10 py-4 rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showAddProfile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddProfile} className="bg-slate-900 border border-white/20 p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Users className="text-cyan-400" /> Add New Participant
            </h2>

            <label className="block text-sm text-slate-400 mb-2">Name</label>
            <input
              type="text"
              className={`w-full p-4 rounded-xl bg-white/5 border mb-2 outline-none focus:ring-2 transition ${
                formErrors.name ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-cyan-500'
              }`}
              placeholder="John Doe"
              value={newProfile.name}
              onChange={(e) => setNewProfile({...newProfile, name: e.target.value})}
              required
            />
            {formErrors.name && <p className="text-red-400 text-sm mb-4">{formErrors.name}</p>}
            <p className="text-xs text-slate-500 mb-4">Name must be 2-30 characters, letters only</p>

            <label className="block text-sm text-slate-400 mb-2">Starting Weight (kg)</label>
            <input
              type="text"
              className={`w-full p-4 rounded-xl bg-white/5 border mb-2 outline-none focus:ring-2 transition ${
                formErrors.baseline ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-cyan-500'
              }`}
              placeholder="80.0 or 80,0"
              value={newProfile.baseline}
              onChange={(e) => setNewProfile({...newProfile, baseline: e.target.value})}
              required
            />
            {formErrors.baseline && <p className="text-red-400 text-sm mb-4">{formErrors.baseline}</p>}

            <label className="block text-sm text-slate-400 mb-2">Goal Weight (kg)</label>
            <input
              type="text"
              className={`w-full p-4 rounded-xl bg-white/5 border mb-2 outline-none focus:ring-2 transition ${
                formErrors.goal ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-cyan-500'
              }`}
              placeholder="70.0 or 70,0"
              value={newProfile.goal}
              onChange={(e) => setNewProfile({...newProfile, goal: e.target.value})}
              required
            />
            {formErrors.goal && <p className="text-red-400 text-sm mb-4">{formErrors.goal}</p>}
            <p className="text-xs text-slate-500 mb-6">Weight range: {WEIGHT_MIN}-{WEIGHT_MAX}kg</p>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className={`flex-1 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                  submitting 
                    ? 'bg-gray-600 cursor-not-allowed' 
                    : 'bg-cyan-600 hover:bg-cyan-500'
                }`}
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    Creating...
                  </>
                ) : (
                  'Create Profile'
                )}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setShowAddProfile(false);
                  setNewProfile({ name: '', baseline: '', goal: '' });
                  setFormErrors({});
                }}
                className="flex-1 bg-white/5 hover:bg-white/10 py-4 rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showProfileDetail && selectedProfile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-white/20 p-8 rounded-3xl w-full max-w-2xl shadow-2xl my-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-3xl font-bold mb-2">{selectedProfile.name}</h2>
                <div className="flex gap-4 text-sm text-slate-400">
                  <span>Start: <span className="text-white">{selectedProfile.baseline_weight}kg</span></span>
                  <span>Goal: <span className="text-emerald-400">{selectedProfile.goal_weight}kg</span></span>
                  <span>Progress: <span className="text-cyan-400">{selectedProfile.percentage_lost?.toFixed(1)}%</span></span>
                </div>
                {profileHistory.length > 0 && (
                  <div className="flex gap-4 text-sm text-slate-400 mt-2">
                    <span>Streak: <span className="text-yellow-400">{getStreakCount(profileHistory)} weigh-ins</span></span>
                    <span>Total entries: <span className="text-blue-400">{profileHistory.length}</span></span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {isAdmin && (
                  <>
                    <button
                      onClick={() => openEditProfile(selectedProfile)}
                      className="p-2 bg-blue-600/20 rounded-lg hover:bg-blue-600/30 transition"
                      title="Edit Profile"
                    >
                      <Edit2 size={20} />
                    </button>
                    <button
                      onClick={() => openConfirmDialog('delete-profile', selectedProfile)}
                      className="p-2 bg-red-600/20 rounded-lg hover:bg-red-600/30 transition"
                      title="Delete Profile"
                    >
                      <Trash2 size={20} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowProfileDetail(false)}
                  className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                <div className="text-2xl font-bold text-emerald-400">
                  {selectedProfile.current_weight || '--'}kg
                </div>
                <div className="text-xs text-slate-400 uppercase">Current</div>
              </div>
              <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                <div className="text-2xl font-bold text-blue-400">
                  -{selectedProfile.weight_lost?.toFixed(1) || '0'}kg
                </div>
                <div className="text-xs text-slate-400 uppercase">Total Lost</div>
              </div>
              <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                <div className="text-2xl font-bold text-cyan-400">
                  {profileHistory.length}
                </div>
                <div className="text-xs text-slate-400 uppercase">Weigh-ins</div>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <div className="p-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
                <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Weigh-in History</h3>
                {profileHistory.length > 0 && (
                  <div className="flex gap-4 text-xs text-slate-500">
                    <span>Latest: {new Date(profileHistory[0].recorded_at).toLocaleDateString()}</span>
                    {profileHistory.length > 1 && (
                      <span>First: {new Date(profileHistory[profileHistory.length - 1].recorded_at).toLocaleDateString()}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {profileHistory.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">No weigh-ins recorded yet</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-white/5 sticky top-0">
                      <tr className="text-left text-xs text-slate-400 uppercase">
                        <th className="p-3">Date</th>
                        <th className="p-3">Weight</th>
                        <th className="p-3">Change</th>
                        <th className="p-3">To Goal</th>
                        {isAdmin && <th className="p-3 text-center">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {profileHistory.map((entry, index) => {
                        const prevWeight = profileHistory[index + 1]?.current_weight || selectedProfile.baseline_weight;
                        const change = prevWeight - entry.current_weight;
                        const toGoal = entry.current_weight - selectedProfile.goal_weight;

                        return (
                          <tr key={entry.id} className="border-t border-white/5 hover:bg-white/5 transition">
                            <td className="p-3 text-sm">
                              {new Date(entry.recorded_at).toLocaleDateString('en-ZA', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </td>
                            <td className="p-3">
                              <span className="font-mono font-bold">{entry.current_weight}kg</span>
                            </td>
                            <td className="p-3">
                              {change !== 0 && (
                                <span className={`text-sm font-mono ${change > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {change > 0 ? '-' : '+'}{Math.abs(change).toFixed(1)}kg
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <span className="text-sm text-slate-400 font-mono">
                                {toGoal > 0 ? `${toGoal.toFixed(1)}kg to go` : 'Goal reached!'}
                              </span>
                            </td>
                            {isAdmin && (
                              <td className="p-3">
                                <div className="flex gap-2 justify-center">
                                  <button
                                    onClick={() => openEditWeight(entry)}
                                    className="p-1 bg-blue-600/20 rounded hover:bg-blue-600/30 transition"
                                    title="Edit Weight"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => openConfirmDialog('delete-weight', entry)}
                                    className="p-1 bg-red-600/20 rounded hover:bg-red-600/30 transition"
                                    title="Delete Weight"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <button
              onClick={() => setShowProfileDetail(false)}
              className="w-full mt-6 bg-white/5 hover:bg-white/10 py-4 rounded-xl transition font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showEditProfile && selectedProfile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <form onSubmit={handleEditProfile} className="bg-slate-900 border border-white/20 p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Edit2 className="text-blue-400" /> Edit Profile
            </h2>

            <label className="block text-sm text-slate-400 mb-2">Name</label>
            <input
              type="text"
              className={`w-full p-4 rounded-xl bg-white/5 border mb-2 outline-none focus:ring-2 transition ${
                formErrors.name ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-blue-500'
              }`}
              placeholder="John Doe"
              value={editProfile.name}
              onChange={(e) => setEditProfile({...editProfile, name: e.target.value})}
              required
            />
            {formErrors.name && <p className="text-red-400 text-sm mb-4">{formErrors.name}</p>}

            <label className="block text-sm text-slate-400 mb-2">Starting Weight (kg)</label>
            <input
              type="text"
              className={`w-full p-4 rounded-xl bg-white/5 border mb-2 outline-none focus:ring-2 transition ${
                formErrors.baseline ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-blue-500'
              }`}
              placeholder="80.0 or 80,0"
              value={editProfile.baseline}
              onChange={(e) => setEditProfile({...editProfile, baseline: e.target.value})}
              required
            />
            {formErrors.baseline && <p className="text-red-400 text-sm mb-4">{formErrors.baseline}</p>}

            <label className="block text-sm text-slate-400 mb-2">Goal Weight (kg)</label>
            <input
              type="text"
              className={`w-full p-4 rounded-xl bg-white/5 border mb-6 outline-none focus:ring-2 transition ${
                formErrors.goal ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-blue-500'
              }`}
              placeholder="70.0 or 70,0"
              value={editProfile.goal}
              onChange={(e) => setEditProfile({...editProfile, goal: e.target.value})}
              required
            />
            {formErrors.goal && <p className="text-red-400 text-sm mb-4">{formErrors.goal}</p>}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className={`flex-1 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                  submitting 
                    ? 'bg-gray-600 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    Updating...
                  </>
                ) : (
                  'Update Profile'
                )}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setShowEditProfile(false);
                  setFormErrors({});
                }}
                className="flex-1 bg-white/5 hover:bg-white/10 py-4 rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showEditWeight && selectedWeight && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <form onSubmit={handleEditWeight} className="bg-slate-900 border border-white/20 p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Edit2 className="text-emerald-400" /> Edit Weight Entry
            </h2>

            <label className="block text-sm text-slate-400 mb-2">Weight (kg)</label>
            <input
              type="text"
              className={`w-full p-4 rounded-xl bg-white/5 border mb-2 outline-none focus:ring-2 transition ${
                formErrors.weight ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-emerald-500'
              }`}
              placeholder="0.0 or 0,0"
              value={editWeight.weight}
              onChange={(e) => setEditWeight({...editWeight, weight: e.target.value})}
              required
            />
            {formErrors.weight && <p className="text-red-400 text-sm mb-4">{formErrors.weight}</p>}

            <label className="block text-sm text-slate-400 mb-2">Date</label>
            <input
              type="date"
              className={`w-full p-4 rounded-xl bg-white/5 border mb-6 outline-none focus:ring-2 transition ${
                formErrors.date ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-emerald-500'
              }`}
              value={editWeight.date}
              onChange={(e) => setEditWeight({...editWeight, date: e.target.value})}
              required
            />
            {formErrors.date && <p className="text-red-400 text-sm mb-4">{formErrors.date}</p>}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className={`flex-1 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                  submitting 
                    ? 'bg-gray-600 cursor-not-allowed' 
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    Updating...
                  </>
                ) : (
                  'Update Entry'
                )}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setShowEditWeight(false);
                  setFormErrors({});
                }}
                className="flex-1 bg-white/5 hover:bg-white/10 py-4 rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showConfirmDialog && confirmAction && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-red-500/50 p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-red-400">
              <AlertTriangle /> {confirmAction.title}
            </h2>
            <p className="text-slate-300 mb-6 leading-relaxed">{confirmAction.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  confirmAction.action();
                  setShowConfirmDialog(false);
                  setConfirmAction(null);
                }}
                className="flex-1 bg-red-600 hover:bg-red-500 py-4 rounded-xl font-bold transition-all"
              >
                Delete
              </button>
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setConfirmAction(null);
                }}
                className="flex-1 bg-white/5 hover:bg-white/10 py-4 rounded-xl transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAchievements && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-yellow-500/50 p-8 rounded-3xl w-full max-w-4xl shadow-2xl my-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold flex items-center gap-2">
                <Award className="text-yellow-400" /> Achievement Gallery
              </h2>
              <button
                onClick={() => setShowAchievements(false)}
                className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {achievements.map(achievement => {
                const profilesWithAchievement = profiles.filter(profile => {
                  const history = profileHistory; // This would need profile-specific history in real implementation
                  return achievement.criteria(profile, history);
                });

                return (
                  <div key={achievement.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition">
                    <div className="text-center mb-4">
                      <div className="text-4xl mb-2">{achievement.icon}</div>
                      <h3 className="text-xl font-bold text-yellow-400">{achievement.title}</h3>
                      <p className="text-sm text-slate-400 mt-1">{achievement.description}</p>
                    </div>
                    
                    {profilesWithAchievement.length > 0 ? (
                      <div>
                        <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Unlocked by:</p>
                        <div className="space-y-1">
                          {profilesWithAchievement.map(profile => (
                            <div key={profile.id} className="text-sm text-white font-medium">
                              🎉 {profile.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-xs text-slate-500 uppercase tracking-wide">🔒 Locked</p>
                        <p className="text-xs text-slate-600 mt-1">No one has unlocked this yet!</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showWeeklySummary && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-purple-500/50 p-8 rounded-3xl w-full max-w-4xl shadow-2xl my-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold flex items-center gap-2">
                <Calendar className="text-purple-400" /> Weekly Progress Summary
              </h2>
              <button
                onClick={() => setShowWeeklySummary(false)}
                className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-6">
              {generateWeeklySummary().map(profile => (
                <div key={profile.id} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-2xl font-bold">{profile.name}</h3>
                      <div className="flex gap-4 text-sm text-slate-400 mt-1">
                        <span>Progress: <span className="text-cyan-400">{profile.percentage_lost?.toFixed(1)}%</span></span>
                        <span>Streak: <span className="text-yellow-400">{profile.streak} weigh-ins</span></span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-emerald-400">
                        -{profile.weight_lost?.toFixed(1) || '0'}kg
                      </div>
                      <div className="text-xs text-slate-400">Total Lost</div>
                    </div>
                  </div>
                  
                  {profile.unlockedAchievements.length > 0 && (
                    <div>
                      <p className="text-sm text-yellow-400 font-medium mb-2">🏆 Recent Achievements:</p>
                      <div className="flex flex-wrap gap-2">
                        {profile.unlockedAchievements.map(achievement => (
                          <div key={achievement.id} className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg px-3 py-1 text-xs">
                            {achievement.icon} {achievement.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-xl border border-purple-500/30">
              <h3 className="text-lg font-bold mb-2 text-center">🎯 Group Challenge Ideas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="bg-white/5 rounded-lg p-3">
                  <span className="font-medium text-emerald-400">Total Group Loss:</span>
                  <span className="ml-2">{profiles.reduce((sum, p) => sum + (p.weight_lost || 0), 0).toFixed(1)}kg</span>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <span className="font-medium text-blue-400">Average Progress:</span>
                  <span className="ml-2">{(profiles.reduce((sum, p) => sum + (p.percentage_lost || 0), 0) / profiles.length).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
