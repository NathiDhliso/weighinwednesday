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
          'Weight Lost (kg)': p.total_lost,
          'Progress to Goal (%)': p.percentage_to_goal,
          'Last Weigh-in': p.last_recorded ? new Date(p.last_recorded).toLocaleDateString() : 'Never',
          'Days Since Start': Math.floor((Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24)),
          'Profile Created': new Date(p.created_at).toLocaleDateString()
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
            <button className="p-3 bg-purple-600 rounded-full backdrop-blur-md hover:scale-110 transition-transform shadow-lg" title="Weekly Summary">
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

      {/* TODO: Add modals back - Login, Add Weight, Add Profile, Profile Detail, etc. */}
      {/* For now, just the core layout is working */}
    </div>
  );
}

export default App;