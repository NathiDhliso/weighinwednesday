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

  // SILVER BULLET BACKUP SYSTEM - Bulletproof Excel Auto-Backup
  const saveBackupPath = (path: string) => {
    setBackupPath(path);
    localStorage.setItem('weighin_backup_path', path);
    addNotification('success', `💾 Backup path saved: ${path}`);
  };

  const toggleAutoBackup = (enabled: boolean) => {
    setAutoBackupEnabled(enabled);
    localStorage.setItem('weighin_auto_backup', enabled.toString());
    addNotification('info', `🔄 Auto-backup ${enabled ? 'enabled' : 'disabled'}`);
  };

  const createExcelBackup = async (): Promise<{ workbook: any; filename: string }> => {
    try {
      addNotification('info', '📊 Creating Excel backup...', 3000);
      
      // Get comprehensive data from all sources
      const [leaderboardResult, weightsResult, profilesResult] = await Promise.all([
        supabase.from('leaderboard').select('*'),
        supabase.from('weights').select('*'),
        supabase.from('profiles').select('*')
      ]);

      if (leaderboardResult.error) throw leaderboardResult.error;
      if (weightsResult.error) throw weightsResult.error;
      if (profilesResult.error) throw profilesResult.error;

      const leaderboardData = leaderboardResult.data || [];
      const weightsData = weightsResult.data || [];
      const profilesData = profilesResult.data || [];

      // Create workbook with multiple sheets
      const workbook = XLSX.utils.book_new();

      // 1. CURRENT STANDINGS SHEET (Leaderboard)
      if (leaderboardData.length > 0) {
        const standingsWS = XLSX.utils.json_to_sheet(leaderboardData.map(p => ({
          Rank: leaderboardData.indexOf(p) + 1,
          Name: p.name,
          'Current Weight (kg)': p.current_weight,
          'Baseline Weight (kg)': p.baseline_weight,
          'Goal Weight (kg)': p.goal_weight,
          'Weight Lost (kg)': p.weight_lost,
          'Progress to Goal (%)': p.percentage_lost,
          'Last Weigh-in': p.last_weigh_in ? new Date(p.last_weigh_in).toLocaleDateString() : 'Never',
          'Profile ID': p.id,
          'Date Joined': new Date().toLocaleDateString()
        })));
        XLSX.utils.book_append_sheet(workbook, standingsWS, 'Current Standings');
      }

      // 2. COMPLETE WEIGHT HISTORY SHEET
      if (weightsData.length > 0) {
        const historyWS = XLSX.utils.json_to_sheet(
          weightsData
            .map(w => {
              const profile = profilesData.find(p => p.id === w.profile_id);
              return {
                'Entry ID': w.id,
                'Profile Name': profile?.name || 'Unknown',
                'Weight (kg)': w.current_weight,
                'Recorded Date': new Date(w.recorded_at).toLocaleDateString(),
                'Recorded Time': new Date(w.recorded_at).toLocaleTimeString(),
                'Day of Week': new Date(w.recorded_at).toLocaleDateString('en-US', { weekday: 'long' }),
                'Profile ID': w.profile_id,
                'Baseline Weight': profile?.baseline_weight,
                'Goal Weight': profile?.goal_weight
              };
            })
            .sort((a, b) => new Date(b['Recorded Date']).getTime() - new Date(a['Recorded Date']).getTime())
        );
        XLSX.utils.book_append_sheet(workbook, historyWS, 'Weight History');
      }

      // 3. PROFILES MASTER DATA SHEET
      if (profilesData.length > 0) {
        const profilesWS = XLSX.utils.json_to_sheet(profilesData.map(p => ({
          'Profile ID': p.id,
          'Name': p.name,
          'Baseline Weight (kg)': p.baseline_weight,
          'Goal Weight (kg)': p.goal_weight,
          'Target Loss (kg)': p.baseline_weight - p.goal_weight,
          'Created Date': new Date(p.created_at).toLocaleDateString(),
          'Total Entries': weightsData.filter(w => w.profile_id === p.id).length
        })));
        XLSX.utils.book_append_sheet(workbook, profilesWS, 'Profiles Master');
      }

      // 4. BACKUP METADATA SHEET
      const metadataWS = XLSX.utils.json_to_sheet([{
        'Backup Created': new Date().toLocaleString(),
        'Total Participants': profilesData.length,
        'Total Weight Entries': weightsData.length,
        'Data Source': 'Supabase Database',
        'App Version': '2.0 - Mobile First',
        'Backup Type': 'Complete Data Export',
        'Export Format': 'Excel XLSX',
        'Next Suggested Backup': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()
      }]);
      XLSX.utils.book_append_sheet(workbook, metadataWS, 'Backup Info');

      // Generate timestamped filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const timeStr = new Date().toLocaleTimeString().replace(/[:.]/g, '-');
      const filename = `WeighIn-Wednesday-COMPLETE-${timestamp}-${timeStr}.xlsx`;
      
      return { workbook, filename };
    } catch (error) {
      console.error('❌ Excel backup creation failed:', error);
      throw new Error(`Backup creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const downloadExcelBackup = async () => {
    try {
      const { workbook, filename } = await createExcelBackup();
      
      // Convert to blob and trigger download
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      addNotification('success', `📊 Excel backup downloaded: ${filename}`, 8000);
      
      // Update last backup time in localStorage
      localStorage.setItem('weighin_last_backup', new Date().toISOString());
    } catch (error) {
      console.error('❌ Download failed:', error);
      addNotification('error', `Failed to download backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const autoSaveBackup = async () => {
    if (!autoBackupEnabled) {
      console.log('🚫 Auto-backup disabled, skipping...');
      return;
    }
    
    try {
      const { workbook, filename } = await createExcelBackup();
      
      // Save to Downloads with browser API
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      const backupMsg = backupPath.trim() 
        ? `💾 Auto-backup saved to Downloads. Please move to: ${backupPath}` 
        : `💾 Auto-backup saved to Downloads folder: ${filename}`;
      
      addNotification('info', backupMsg, 10000);
      localStorage.setItem('weighin_last_auto_backup', new Date().toISOString());
      
    } catch (error) {
      console.error('❌ Auto-backup failed:', error);
      addNotification('error', `Auto-backup failed: ${error instanceof Error ? error.message : 'Check your connection'}`);
    }
  };

  const exportData = useCallback(() => {
    try {
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
        total_participants: profiles.length,
        backup_type: 'JSON Export'
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `weigh-in-wednesday-json-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      addNotification('success', '📁 JSON data exported successfully!');
    } catch (error) {
      addNotification('error', `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [profiles, addNotification]);

  const shareStats = () => {
    // 🐛 FIX: Handle cases with no data or minimal progress
    if (profiles.length === 0) {
      const text = `🏆 *WEIGH-IN WEDNESDAY RESULTS*\n\n📊 No participants yet. Join the challenge! 💪`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      return;
    }

    // Get top performers (prioritize those with progress, but include all if needed)
    const profilesWithProgress = profiles.filter(p => p.percentage_lost && p.percentage_lost > 0);
    const profilesWithWeighIns = profiles.filter(p => p.current_weight);
    const top3 = (profilesWithProgress.length >= 3 ? profilesWithProgress : profilesWithWeighIns).slice(0, 3);

    const biggestLoser = [...profiles]
      .filter(p => p.weight_lost && p.weight_lost > 0)
      .sort((a, b) => (b.weight_lost || 0) - (a.weight_lost || 0))[0];

    let text = `🏆 *WEIGH-IN WEDNESDAY RESULTS*\n\n`;

    if (biggestLoser) {
      text += `🔥 *Biggest Overall Loser:* ${biggestLoser.name} (-${biggestLoser.weight_lost?.toFixed(1)}kg)\n\n`;
    }

    text += `📊 *Top 3 Progress Leaders:*\n`;
    
    if (top3.length === 0) {
      text += `No weigh-ins recorded yet. Get started! 🎯\n`;
    } else {
      top3.forEach((p, i) => {
        const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
        const progress = p.percentage_lost && p.percentage_lost > 0 
          ? `${p.percentage_lost}% progress` 
          : 'Getting started';
        const weightInfo = p.weight_lost && p.weight_lost > 0 
          ? ` (${Math.abs(p.weight_lost).toFixed(1)}kg lost)` 
          : p.current_weight ? ` (Current: ${p.current_weight}kg)` : '';
        text += `${emoji} ${p.name}: ${progress}${weightInfo}\n`;
      });
    }

    text += `\n💪 Keep crushing it, team!`;

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const openProfileDetail = async (person: LeaderboardEntry) => {
    setSelectedProfile(person);
    const history = await fetchProfileHistory(person.id);
    setShowProfileDetail(true);
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('leaderboard').select('*');
      if (error) throw error;
      setProfiles(data || []);
      
      // 🛡️ SILVER BULLET: Auto-backup after successful data load
      if (autoBackupEnabled && (data || []).length > 0) {
        // Delay auto-backup to not block UI
        setTimeout(() => {
          autoSaveBackup();
        }, 3000);
      }
    } catch (error) {
      console.error('Error:', error);
      addNotification('error', 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
      return false;
    }
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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setShowLogin(false);
      setPasswordInput('');
      addNotification('success', 'Admin access granted!');
    } else {
      addNotification('error', 'Incorrect password');
    }
  };

  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
        setFormErrors({ weight: 'A weight entry already exists for this date.' });
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
    e.stopPropagation();
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
      setShowProfileDetail(false);
      fetchData();
    } catch (error: any) {
      addNotification('error', `Failed to update profile: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWeightId) return;
    
    setSubmitting(true);
    setFormErrors({});
    
    try {
      const weightValidation = validateWeight(editWeight.weight);
      if (!weightValidation.isValid) {
        setFormErrors(weightValidation.errors);
        return;
      }
      
      if (editWeight.date) {
        const dateValidation = validateDate(editWeight.date);
        if (!dateValidation.isValid) {
          setFormErrors(dateValidation.errors);
          return;
        }
      }

      const { error } = await supabase
        .from('weights')
        .update({
          current_weight: parseWeight(editWeight.weight),
          recorded_at: editWeight.date || new Date().toISOString()
        })
        .eq('id', selectedWeightId);

      if (error) throw error;
      
      addNotification('success', 'Weight entry updated!');
      setShowEditWeight(false);
      fetchData();
      if (selectedProfile) {
        await fetchProfileHistory(selectedProfile.id);
      }
    } catch (error: any) {
      addNotification('error', `Failed to update weight: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    
    if (deleteTarget.type === 'profile') {
      handleDeleteProfile();
    } else {
      handleDeleteWeight();
    }
  };

  const handleDeleteProfile = async () => {
    if (!deleteTarget) return;
    
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', deleteTarget.id);

      if (error) throw error;
      
      addNotification('success', `${deleteTarget.name} removed from leaderboard`);
      setShowConfirmDialog(false);
      setShowProfileDetail(false);
      setDeleteTarget(null);
      fetchData();
    } catch (error: any) {
      addNotification('error', `Failed to delete profile: ${error.message}`);
    }
  };

  const handleDeleteWeight = async () => {
    if (!deleteTarget) return;
    
    try {
      const { error } = await supabase
        .from('weights')
        .delete()
        .eq('id', deleteTarget.id);

      if (error) throw error;
      
      addNotification('success', 'Weight entry deleted');
      setShowConfirmDialog(false);
      setDeleteTarget(null);
      fetchData();
      if (selectedProfile) {
        await fetchProfileHistory(selectedProfile.id);
      }
    } catch (error: any) {
      addNotification('error', `Failed to delete weight: ${error.message}`);
    }
  };

  const openEditProfile = (profile: LeaderboardEntry) => {
    setSelectedProfile(profile);
    setEditProfile({
      name: profile.name,
      baseline: profile.baseline_weight.toString(),
      goal: profile.goal_weight.toString()
    });
    setShowEditProfile(true);
  };

  const openEditWeight = (weight: Weight) => {
    setSelectedWeightId(weight.id);
    setEditWeight({
      weight: weight.current_weight.toString(),
      date: weight.recorded_at.split('T')[0]
    });
    setShowEditWeight(true);
  };

  const openDeleteProfile = (profile: LeaderboardEntry) => {
    setDeleteTarget({ type: 'profile', id: profile.id, name: profile.name });
    setShowConfirmDialog(true);
  };

  const openDeleteWeight = (weight: Weight) => {
    const profile = profiles.find(p => p.id === weight.profile_id);
    setDeleteTarget({ 
      type: 'weight', 
      id: weight.id, 
      name: `${profile?.name || 'Unknown'}'s weight entry` 
    });
    setShowConfirmDialog(true);
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

  return (
    <div className="mobile-safe-height bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white font-sans overflow-x-hidden">
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
                      className="w-full p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
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
          onClick={(e) => {
            e.stopPropagation();
            setShowAchievements(true);
          }}
          className="p-3 bg-yellow-600 rounded-full backdrop-blur-md hover:scale-110 transition-transform shadow-lg"
          title="Achievements"
        >
          <Award size={20} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            shareStats();
          }}
          className="p-3 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full backdrop-blur-md hover:scale-110 transition-transform shadow-lg shadow-emerald-500/20"
          title="Share Stats"
        >
          <Share2 size={20} />
        </button>
      </Header>

      <main className="container-main space-y-3 sm:space-y-4 pb-20 sm:pb-24 md:pb-32">
        {loading ? (
          <div className="text-center py-12 sm:py-16 md:py-20 text-slate-400">Loading...</div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-12 sm:py-16 md:py-20">
            <Trophy size={48} className="sm:w-16 sm:h-16 mx-auto mb-4 opacity-20" />
            <p className="text-slate-400 text-sm sm:text-base">No participants yet. Add profiles to get started!</p>
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
      </main>

      <FloatingActions
        isAdmin={isAdmin}
        onAddWeight={() => setShowAddWeight(true)}
        onAddProfile={() => setShowAddProfile(true)}
        onAdminToggle={() => isAdmin ? setIsAdmin(false) : setShowLogin(true)}
      />

      {/* LOGIN MODAL */}
      {showLogin && (
        <Modal onClose={() => setShowLogin(false)} title="Admin Login">
          <form onSubmit={handleLogin} className="space-y-4">
            <FormField
              label="Password"
              type="password"
              value={passwordInput}
              onChange={(value) => setPasswordInput(value)}
              placeholder="Enter admin password"
              icon={<Lock size={20} />}
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowLogin(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1">
                Login
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ADD WEIGHT MODAL */}
      {showAddWeight && (
        <Modal onClose={() => setShowAddWeight(false)} title="Add Weight Entry">
          <form onSubmit={handleAddWeight} className="space-y-4">
            <div>
              <label className="block text-slate-300 text-sm mb-2">Participant</label>
              <select
                value={newWeight.profile_id}
                onChange={(e) => setNewWeight({...newWeight, profile_id: e.target.value})}
                className={`form-input ${formErrors.profile_id ? 'border-red-400' : ''}`}
              >
                <option value="">Select participant...</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {formErrors.profile_id && (
                <p className="text-red-400 text-sm mt-1">{formErrors.profile_id}</p>
              )}
            </div>
            
            <FormField
              label="Current Weight (kg)"
              type="number"
              value={newWeight.weight}
              onChange={(value) => setNewWeight({...newWeight, weight: value})}
              placeholder="e.g., 75.5"
              step="0.1"
              error={formErrors.weight}
            />
            
            <FormField
              label="Date (optional)"
              type="date"
              value={newWeight.date}
              onChange={(value) => setNewWeight({...newWeight, date: value})}
              error={formErrors.date}
            />
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowAddWeight(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={submitting}
                className="btn-primary flex-1"
              >
                {submitting ? 'Adding...' : 'Add Weight'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ADD PROFILE MODAL */}
      {showAddProfile && (
        <Modal onClose={() => setShowAddProfile(false)} title="Add New Participant">
          <form onSubmit={handleAddProfile} className="space-y-4">
            <FormField
              label="Full Name"
              type="text"
              value={newProfile.name}
              onChange={(value) => setNewProfile({...newProfile, name: value})}
              placeholder="Enter full name"
              error={formErrors.name}
            />
            
            <FormField
              label="Starting Weight (kg)"
              type="number"
              value={newProfile.baseline}
              onChange={(value) => setNewProfile({...newProfile, baseline: value})}
              placeholder="e.g., 80"
              step="0.1"
              error={formErrors.baseline}
            />
            
            <FormField
              label="Goal Weight (kg)"
              type="number"
              value={newProfile.goal}
              onChange={(value) => setNewProfile({...newProfile, goal: value})}
              placeholder="e.g., 70"
              step="0.1"
              error={formErrors.goal}
            />
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowAddProfile(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={submitting}
                className="btn-primary flex-1"
              >
                {submitting ? 'Creating...' : 'Create Profile'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* PROFILE DETAIL MODAL */}
      {showProfileDetail && selectedProfile && (
        <Modal 
          onClose={() => setShowProfileDetail(false)} 
          title={selectedProfile.name}
          className="max-w-2xl"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-4 rounded-lg">
                <p className="text-slate-400 text-sm">Current Weight</p>
                <p className="text-2xl font-bold">
                  {selectedProfile.current_weight ? `${selectedProfile.current_weight}kg` : 'Not recorded'}
                </p>
              </div>
              <div className="bg-slate-800 p-4 rounded-lg">
                <p className="text-slate-400 text-sm">Progress</p>
                <p className="text-2xl font-bold">
                  {selectedProfile.percentage_lost ? `${selectedProfile.percentage_lost}%` : '0%'}
                </p>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-bold mb-3">Weight History</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {profileHistory.length === 0 ? (
                  <p className="text-slate-400">No weight entries yet</p>
                ) : (
                  profileHistory.map(weight => (
                    <div key={weight.id} className="flex justify-between items-center bg-slate-800 p-3 rounded">
                      <div>
                        <p className="font-medium">{weight.current_weight}kg</p>
                        <p className="text-sm text-slate-400">
                          {new Date(weight.recorded_at).toLocaleDateString()}
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditWeight(weight)}
                            className="p-2 text-blue-400 hover:bg-blue-400/20 rounded"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => openDeleteWeight(weight)}
                            className="p-2 text-red-400 hover:bg-red-400/20 rounded"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            
            {isAdmin && (
              <div className="flex gap-3">
                <button
                  onClick={(e) => { e.stopPropagation(); openEditProfile(selectedProfile); }}
                  className="btn-secondary flex-1"
                >
                  <Edit2 size={16} className="mr-2" />
                  Edit Profile
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); openDeleteProfile(selectedProfile); }}
                  className="btn-danger flex-1"
                >
                  <Trash2 size={16} className="mr-2" />
                  Delete Profile
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* EDIT PROFILE MODAL */}
      {showEditProfile && selectedProfile && (
        <Modal onClose={() => setShowEditProfile(false)} title="Edit Profile">
          <form onSubmit={handleEditProfile} className="space-y-4">
            <FormField
              label="Full Name"
              type="text"
              value={editProfile.name}
              onChange={(value) => setEditProfile({...editProfile, name: value})}
              error={formErrors.name}
            />
            
            <FormField
              label="Starting Weight (kg)"
              type="number"
              value={editProfile.baseline}
              onChange={(value) => setEditProfile({...editProfile, baseline: value})}
              step="0.1"
              error={formErrors.baseline}
            />
            
            <FormField
              label="Goal Weight (kg)"
              type="number"
              value={editProfile.goal}
              onChange={(value) => setEditProfile({...editProfile, goal: value})}
              step="0.1"
              error={formErrors.goal}
            />
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowEditProfile(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={submitting}
                className="btn-primary flex-1"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* EDIT WEIGHT MODAL */}
      {showEditWeight && (
        <Modal onClose={() => setShowEditWeight(false)} title="Edit Weight Entry">
          <form onSubmit={handleEditWeight} className="space-y-4">
            <FormField
              label="Weight (kg)"
              type="number"
              value={editWeight.weight}
              onChange={(value) => setEditWeight({...editWeight, weight: value})}
              step="0.1"
              error={formErrors.weight}
            />
            
            <FormField
              label="Date"
              type="date"
              value={editWeight.date}
              onChange={(value) => setEditWeight({...editWeight, date: value})}
              error={formErrors.date}
            />
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowEditWeight(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={submitting}
                className="btn-primary flex-1"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* CONFIRM DELETE MODAL */}
      {showConfirmDialog && deleteTarget && (
        <Modal onClose={() => setShowConfirmDialog(false)} title="Confirm Delete">
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle className="text-red-400" size={24} />
              <p className="text-red-200">
                Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
                {deleteTarget.type === 'profile' && (
                  <span className="block text-sm text-red-300 mt-1">
                    This will also delete all weight entries for this person.
                  </span>
                )}
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); setShowConfirmDialog(false); }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); confirmDelete(); }}
                className="btn-danger flex-1"
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* WEEKLY SUMMARY MODAL */}
      {showWeeklySummary && (
        <Modal onClose={() => setShowWeeklySummary(false)} title="Weekly Summary">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-4 rounded-lg">
                <p className="text-slate-400 text-sm">Total Participants</p>
                <p className="text-2xl font-bold">{profiles.length}</p>
              </div>
              <div className="bg-slate-800 p-4 rounded-lg">
                <p className="text-slate-400 text-sm">Active This Week</p>
                <p className="text-2xl font-bold">
                  {profiles.filter(p => p.last_weigh_in && 
                    new Date(p.last_weigh_in).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
                  ).length}
                </p>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-bold mb-3">Top Performers This Period</h3>
              <div className="space-y-2">
                {profiles
                  .filter(p => p.weight_lost && p.weight_lost > 0)
                  .sort((a, b) => (b.weight_lost || 0) - (a.weight_lost || 0))
                  .slice(0, 5)
                  .map((profile, index) => (
                    <div key={profile.id} className="flex justify-between items-center bg-slate-800 p-3 rounded">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅'}
                        </span>
                        <span className="font-medium">{profile.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-400">-{profile.weight_lost?.toFixed(1)}kg</p>
                        <p className="text-sm text-slate-400">{profile.percentage_lost}% to goal</p>
                      </div>
                    </div>
                  ))
                }
                {profiles.filter(p => p.weight_lost && p.weight_lost > 0).length === 0 && (
                  <p className="text-slate-400 text-center py-4">No weight loss recorded yet. Keep going! 💪</p>
                )}
              </div>
            </div>
            
            <div className="border-t border-slate-600 pt-4">
              <button 
                onClick={() => setShowWeeklySummary(false)}
                className="btn-primary w-full"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ACHIEVEMENTS MODAL */}
      {showAchievements && (
        <Modal onClose={() => setShowAchievements(false)} title="Achievements">
          <div className="space-y-4">
            {achievements.map(achievement => {
              const unlockedBy = profiles.filter(profile => {
                return achievement.criteria(profile, profileHistory);
              });
              
              return (
                <div 
                  key={achievement.id} 
                  className={`p-4 rounded-lg border ${
                    unlockedBy.length > 0 
                      ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200'
                      : 'bg-slate-800 border-slate-600 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{achievement.icon}</span>
                    <div className="flex-1">
                      <h3 className="font-bold">{achievement.title}</h3>
                      <p className="text-sm opacity-80">{achievement.description}</p>
                      {unlockedBy.length > 0 && (
                        <p className="text-xs mt-1">
                          Unlocked by: {unlockedBy.map(p => p.name).join(', ')}
                        </p>
                      )}
                    </div>
                    {unlockedBy.length > 0 && (
                      <CheckCircle className="text-yellow-400" size={20} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default App;