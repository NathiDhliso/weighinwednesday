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
                      onChange={(e) => setBackupPath(e.target.value)}
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
                      onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <label htmlFor="autoBackup" className="text-slate-300 text-sm">
                      Auto-backup after data changes
                    </label>
                  </div>

                  <div className="border-t border-slate-600 pt-3">
                    <button className="w-full p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center justify-center gap-2">
                      <Download size={16} />
                      Download Excel Backup Now
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button className="p-3 bg-slate-700 rounded-full backdrop-blur-md hover:scale-110 transition-transform shadow-lg" title="Export Data">
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