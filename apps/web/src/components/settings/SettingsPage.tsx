import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Badge } from '@/components/ui';
import type { User } from 'firebase/auth';
import type { UserSettings } from '@totalis/shared';

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  label: string;
  description?: string;
}

function ToggleSwitch({ enabled, onToggle, label, description }: ToggleSwitchProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-text">{label}</p>
        {description && <p className="text-sm text-text-secondary">{description}</p>}
      </div>
      <button
        onClick={() => onToggle(!enabled)}
        className={`w-12 h-6 rounded-full relative transition-colors ${
          enabled ? 'bg-primary' : 'bg-surface-hover'
        }`}
      >
        <span 
          className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
            enabled ? 'right-1 bg-white' : 'left-1 bg-text-muted'
          }`}
        />
      </button>
    </div>
  );
}

type Theme = 'celestial' | 'sunset' | 'system';

const defaultSettings: UserSettings = {
  theme: 'celestial',
  notifications: {
    morningSummary: { enabled: true, time: '08:00' },
    eveningRecap: { enabled: true, time: '21:00' },
    urgentReminders: true,
    gentleReminders: true,
    emailNotifications: false,
    pushNotifications: false,
  },
  workingHours: { start: '09:00', end: '17:00' },
  weeklyCapacity: 40,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [currentTheme, setCurrentTheme] = useState<Theme>('celestial');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { getAuthInstance } = await import('@/lib/firebase');
        const { onAuthStateChanged } = await import('firebase/auth');
        const auth = getAuthInstance();
        
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
          setUser(firebaseUser);
          setAuthChecked(true);
          
          if (firebaseUser) {
            setDisplayName(firebaseUser.displayName || '');
          } else {
            window.location.href = '/login';
          }
        });

        return () => unsubscribe();
      } catch (err) {
        console.error('Auth check failed:', err);
        setAuthChecked(true);
      }
    };

    checkAuth();
  }, []);

  // Load theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('totalis-theme') as Theme || 'celestial';
    setCurrentTheme(savedTheme);
    setSettings(prev => ({ ...prev, theme: savedTheme }));
  }, []);

  const handleThemeChange = (theme: Theme) => {
    setCurrentTheme(theme);
    setSettings(prev => ({ ...prev, theme }));
    localStorage.setItem('totalis-theme', theme);
    
    if (theme === 'sunset') {
      document.documentElement.setAttribute('data-theme', 'sunset');
    } else if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', 'sunset');
      }
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  };

  const handleUpdateDisplayName = async () => {
    if (!user || !displayName.trim()) return;
    
    setIsSaving(true);
    try {
      const { updateProfile } = await import('firebase/auth');
      await updateProfile(user, { displayName: displayName.trim() });
      setIsEditingName(false);
      setSaveMessage({ type: 'success', text: 'Display name updated!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Failed to update display name:', err);
      setSaveMessage({ type: 'error', text: 'Failed to update name' });
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      const { getAuthInstance } = await import('@/lib/firebase');
      const { signOut } = await import('firebase/auth');
      const auth = getAuthInstance();
      await signOut(auth);
      window.location.href = '/login';
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    const confirmed = window.confirm(
      'Are you sure you want to delete your account? This action cannot be undone.'
    );
    
    if (!confirmed) return;
    
    try {
      const { deleteUser } = await import('firebase/auth');
      await deleteUser(user);
      window.location.href = '/login';
    } catch (err: any) {
      if (err?.code === 'auth/requires-recent-login') {
        setSaveMessage({ 
          type: 'error', 
          text: 'Please log out and log back in before deleting your account.' 
        });
        setTimeout(() => setSaveMessage(null), 5000);
      } else {
        console.error('Failed to delete account:', err);
        setSaveMessage({ type: 'error', text: 'Failed to delete account' });
        setTimeout(() => setSaveMessage(null), 3000);
      }
    }
  };

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-text-muted">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Settings</h1>
        <p className="text-text-secondary mt-1">Manage your preferences and account</p>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <div className={`p-4 rounded-lg ${
          saveMessage.type === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
        }`}>
          {saveMessage.text}
        </div>
      )}

      <div className="grid gap-6">
        {/* Appearance */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-medium text-text mb-3">Theme</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleThemeChange('celestial')}
                  className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                    currentTheme === 'celestial'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-text-secondary hover:border-text-muted'
                  }`}
                >
                  🌙 Celestial (Dark)
                </button>
                <button
                  onClick={() => handleThemeChange('sunset')}
                  className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                    currentTheme === 'sunset'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-text-secondary hover:border-text-muted'
                  }`}
                >
                  🌅 Sunset (Light)
                </button>
                <button
                  onClick={() => handleThemeChange('system')}
                  className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                    currentTheme === 'system'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-text-secondary hover:border-text-muted'
                  }`}
                >
                  💻 System
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <ToggleSwitch
              enabled={settings.notifications.morningSummary.enabled}
              onToggle={(enabled) => setSettings(prev => ({
                ...prev,
                notifications: {
                  ...prev.notifications,
                  morningSummary: { ...prev.notifications.morningSummary, enabled }
                }
              }))}
              label="Morning Summary"
              description={`Daily overview at ${settings.notifications.morningSummary.time}`}
            />
            <ToggleSwitch
              enabled={settings.notifications.eveningRecap.enabled}
              onToggle={(enabled) => setSettings(prev => ({
                ...prev,
                notifications: {
                  ...prev.notifications,
                  eveningRecap: { ...prev.notifications.eveningRecap, enabled }
                }
              }))}
              label="Evening Recap"
              description={`Daily summary at ${settings.notifications.eveningRecap.time}`}
            />
            <ToggleSwitch
              enabled={settings.notifications.urgentReminders}
              onToggle={(urgentReminders) => setSettings(prev => ({
                ...prev,
                notifications: { ...prev.notifications, urgentReminders }
              }))}
              label="Urgent Reminders"
              description="Get notified about urgent tasks"
            />
            <ToggleSwitch
              enabled={settings.notifications.pushNotifications}
              onToggle={(pushNotifications) => setSettings(prev => ({
                ...prev,
                notifications: { ...prev.notifications, pushNotifications }
              }))}
              label="Push Notifications"
              description="Receive browser push notifications"
            />
            <ToggleSwitch
              enabled={settings.notifications.emailNotifications}
              onToggle={(emailNotifications) => setSettings(prev => ({
                ...prev,
                notifications: { ...prev.notifications, emailNotifications }
              }))}
              label="Email Notifications"
              description="Receive email updates and summaries"
            />
          </CardContent>
        </Card>

        {/* Work Schedule */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Work Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text mb-2">Work Start</label>
                <Input
                  type="time"
                  value={settings.workingHours.start}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    workingHours: { ...prev.workingHours, start: e.target.value }
                  }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-2">Work End</label>
                <Input
                  type="time"
                  value={settings.workingHours.end}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    workingHours: { ...prev.workingHours, end: e.target.value }
                  }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Weekly Capacity (hours)
              </label>
              <Input
                type="number"
                min={1}
                max={168}
                value={settings.weeklyCapacity}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  weeklyCapacity: parseInt(e.target.value) || 40
                }))}
                className="w-24"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-2">Timezone</label>
              <p className="text-text-secondary">{settings.timezone}</p>
            </div>
          </CardContent>
        </Card>

        {/* Account */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              {user.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt="Profile" 
                  className="w-16 h-16 rounded-full"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1">
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Display name"
                      className="flex-1"
                    />
                    <Button 
                      size="sm" 
                      onClick={handleUpdateDisplayName}
                      isLoading={isSaving}
                    >
                      Save
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => {
                        setIsEditingName(false);
                        setDisplayName(user.displayName || '');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-text">
                      {user.displayName || 'No name set'}
                    </p>
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="text-text-muted hover:text-text transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                      </svg>
                    </button>
                  </div>
                )}
                <p className="text-text-secondary">{user.email}</p>
                {user.metadata.creationTime && (
                  <p className="text-xs text-text-muted mt-1">
                    Member since {new Date(user.metadata.creationTime).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                )}
              </div>
            </div>
            
            <div className="pt-4 border-t border-border flex flex-wrap gap-3">
              <Button variant="secondary" onClick={handleLogout}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Log Out
              </Button>
              <Button variant="danger" onClick={handleDeleteAccount}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="M3 6h18"/>
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>About Totalis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="primary">Version 1.0.0</Badge>
            </div>
            <p className="text-text-secondary">
              <span className="font-semibold">Total clarity. Total control. Total productivity.</span>
            </p>
            <p className="text-sm text-text-muted">
              Totalis is your AI-powered productivity companion, designed to help you achieve your goals
              through intelligent task management, habit tracking, and deep focus sessions.
            </p>
            <div className="pt-4 flex gap-4">
              <a href="https://github.com/Uniformlyric/Totalis" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm">
                GitHub
              </a>
              <span className="text-text-muted">•</span>
              <a href="#" className="text-primary hover:underline text-sm">
                Privacy Policy
              </a>
              <span className="text-text-muted">•</span>
              <a href="#" className="text-primary hover:underline text-sm">
                Terms of Service
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
