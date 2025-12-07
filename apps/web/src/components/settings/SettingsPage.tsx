import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Badge } from '@/components/ui';
import type { User } from 'firebase/auth';
import type { UserSettings } from '@totalis/shared';
import { doc, setDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { 
  isPushSupported, 
  getNotificationPermission, 
  subscribeToPush, 
  unsubscribeFromPush,
  isPushSubscribed,
  showLocalNotification
} from '@/lib/push';
import { exportAndDownload } from '@/lib/export';
import type { GmailConnectionStatus } from '@/lib/integrations/gmail';
import type { EmailAnalysisResult } from '@/lib/ai/email-analyzer';

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
  workingDays: [1, 2, 3, 4, 5], // Monday-Friday by default
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [currentTheme, setCurrentTheme] = useState<Theme>('celestial');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Gmail integration state
  const [gmailStatus, setGmailStatus] = useState<GmailConnectionStatus>({ connected: false });
  const [isCheckingGmail, setIsCheckingGmail] = useState(true);
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);
  const [isScanningEmails, setIsScanningEmails] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ step: string; current: number; total: number } | null>(null);
  const [analysisResult, setAnalysisResult] = useState<EmailAnalysisResult | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  // Save settings to Firestore
  const saveSettingsToFirestore = useCallback(async (newSettings: UserSettings, userId: string) => {
    try {
      setIsSaving(true);
      const { getDb } = await import('@/lib/firebase');
      const db = getDb();
      const userSettingsRef = doc(db, 'users', userId, 'settings', 'preferences');
      await setDoc(userSettingsRef, {
        ...newSettings,
        updatedAt: new Date()
      }, { merge: true });
      setSaveMessage({ type: 'success', text: 'Settings saved!' });
      setHasUnsavedChanges(false);
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSaveMessage({ type: 'error', text: 'Failed to save settings' });
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Load settings from Firestore
  const loadSettingsFromFirestore = useCallback(async (userId: string) => {
    try {
      const { getDb } = await import('@/lib/firebase');
      const db = getDb();
      const userSettingsRef = doc(db, 'users', userId, 'settings', 'preferences');
      const settingsDoc = await getDoc(userSettingsRef);
      
      if (settingsDoc.exists()) {
        const savedSettings = settingsDoc.data() as UserSettings;
        setSettings(prev => ({ ...defaultSettings, ...savedSettings }));
        if (savedSettings.theme) {
          setCurrentTheme(savedSettings.theme);
          localStorage.setItem('totalis-theme', savedSettings.theme);
          applyTheme(savedSettings.theme);
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Apply theme to DOM
  const applyTheme = (theme: Theme) => {
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

  // Check authentication and load settings
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
            loadSettingsFromFirestore(firebaseUser.uid);
          } else {
            setIsLoading(false);
            window.location.href = '/login';
          }
        });

        return () => unsubscribe();
      } catch (err) {
        console.error('Auth check failed:', err);
        setAuthChecked(true);
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [loadSettingsFromFirestore]);

  // Load theme from localStorage (fallback while Firestore loads)
  useEffect(() => {
    const savedTheme = localStorage.getItem('totalis-theme') as Theme || 'celestial';
    setCurrentTheme(savedTheme);
    applyTheme(savedTheme);
  }, []);

  // Check push notification support
  useEffect(() => {
    const checkPushSupport = async () => {
      setPushSupported(isPushSupported());
      setPushPermission(getNotificationPermission());
      
      // Check if already subscribed
      if (isPushSupported()) {
        const subscribed = await isPushSubscribed();
        if (subscribed) {
          setSettings(prev => ({
            ...prev,
            notifications: { ...prev.notifications, pushNotifications: true }
          }));
        }
      }
    };
    checkPushSupport();
  }, []);

  // Handle push notification toggle
  const handlePushToggle = async () => {
    if (!user || isSubscribingPush) return;
    
    // Import isLocalhost to check environment
    const { isLocalhost } = await import('@/lib/push');
    
    setIsSubscribingPush(true);
    try {
      const { getDb } = await import('@/lib/firebase');
      const db = getDb();
      
      if (settings.notifications.pushNotifications) {
        // Unsubscribe
        await unsubscribeFromPush();
        updateSettings(prev => ({
          ...prev,
          notifications: { ...prev.notifications, pushNotifications: false }
        }));
        setSaveMessage({ type: 'success', text: 'Push notifications disabled' });
      } else {
        // Subscribe
        const subscription = await subscribeToPush();
        
        if (subscription) {
          // Save subscription to Firestore
          const userRef = doc(db, 'users', user.uid);
          await setDoc(userRef, {
            webPushSubscriptions: arrayUnion({
              ...subscription,
              createdAt: new Date(),
              userAgent: navigator.userAgent
            })
          }, { merge: true });
          
          updateSettings(prev => ({
            ...prev,
            notifications: { ...prev.notifications, pushNotifications: true }
          }));
          setPushPermission('granted');
          setSaveMessage({ type: 'success', text: 'Push notifications enabled! 🔔' });
        } else {
          setPushPermission(getNotificationPermission());
          if (getNotificationPermission() === 'denied') {
            setSaveMessage({ type: 'error', text: 'Permission denied. Enable in browser settings.' });
          } else if (isLocalhost()) {
            // Localhost limitation - inform user
            setSaveMessage({ type: 'error', text: 'Push may not work on localhost. Will work in production.' });
          } else {
            setSaveMessage({ type: 'error', text: 'Failed to subscribe. Try again later.' });
          }
        }
      }
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err) {
      console.error('[Push] Toggle failed:', err);
      setSaveMessage({ type: 'error', text: 'Failed to update push notifications' });
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSubscribingPush(false);
    }
  };

  const handleThemeChange = (theme: Theme) => {
    setCurrentTheme(theme);
    const newSettings = { ...settings, theme };
    setSettings(newSettings);
    localStorage.setItem('totalis-theme', theme);
    applyTheme(theme);
    
    // Save to Firestore immediately for theme changes
    if (user) {
      saveSettingsToFirestore(newSettings, user.uid);
    }
  };

  // Update settings and mark as unsaved
  const updateSettings = (updater: (prev: UserSettings) => UserSettings) => {
    setSettings(prev => {
      const newSettings = updater(prev);
      setHasUnsavedChanges(true);
      return newSettings;
    });
  };

  // Save all pending settings
  const handleSaveSettings = async () => {
    if (!user) return;
    await saveSettingsToFirestore(settings, user.uid);
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

  const handleExportData = async (format: 'json' | 'csv') => {
    if (isExporting) return;
    
    setIsExporting(true);
    try {
      await exportAndDownload({ format, includeCompleted: true });
      setSaveMessage({ type: 'success', text: `Data exported as ${format.toUpperCase()}!` });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Export failed:', err);
      setSaveMessage({ type: 'error', text: 'Failed to export data' });
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  // Gmail integration handlers
  useEffect(() => {
    const checkGmailConnection = async () => {
      if (!user) return;
      setIsCheckingGmail(true);
      try {
        const { GmailService } = await import('@/lib/integrations/gmail');
        const gmailService = new GmailService(user.uid);
        const status = await gmailService.getConnectionStatus();
        setGmailStatus(status);
      } catch (err) {
        console.error('Failed to check Gmail connection:', err);
      } finally {
        setIsCheckingGmail(false);
      }
    };
    checkGmailConnection();
  }, [user]);

  const handleGmailConnect = async () => {
    if (!user || isConnectingGmail) return;
    setIsConnectingGmail(true);
    try {
      const { GmailService } = await import('@/lib/integrations/gmail');
      const gmailService = new GmailService(user.uid);
      const status = await gmailService.connect();
      setGmailStatus(status);
      if (status.connected) {
        setSaveMessage({ type: 'success', text: 'Gmail connected successfully!' });
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch (err) {
      console.error('Gmail connect failed:', err);
      setSaveMessage({ type: 'error', text: 'Failed to connect Gmail' });
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsConnectingGmail(false);
    }
  };

  const handleGmailDisconnect = async () => {
    if (!user) return;
    const confirmed = window.confirm('Disconnect Gmail? You can reconnect anytime.');
    if (!confirmed) return;
    
    try {
      const { GmailService } = await import('@/lib/integrations/gmail');
      const gmailService = new GmailService(user.uid);
      await gmailService.disconnect();
      setGmailStatus({ connected: false });
      setSaveMessage({ type: 'success', text: 'Gmail disconnected' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Gmail disconnect failed:', err);
      setSaveMessage({ type: 'error', text: 'Failed to disconnect Gmail' });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleScanEmails = async (range: 'week' | '3months') => {
    if (!user || isScanningEmails) return;
    setIsScanningEmails(true);
    setScanProgress({ step: 'Connecting to Gmail...', current: 0, total: 4 });
    
    try {
      const { GmailService } = await import('@/lib/integrations/gmail');
      const { analyzeEmails, loadExistingItems } = await import('@/lib/ai/email-analyzer');
      
      const gmailService = new GmailService(user.uid);
      
      // Calculate date range
      const now = new Date();
      const startDate = new Date();
      if (range === 'week') {
        startDate.setDate(now.getDate() - 7);
      } else {
        startDate.setMonth(now.getMonth() - 3);
      }
      
      setScanProgress({ step: 'Fetching emails...', current: 1, total: 4 });
      const emails = await gmailService.fetchEmails(startDate, now);
      
      if (emails.length === 0) {
        setSaveMessage({ type: 'success', text: 'No new emails to scan' });
        setTimeout(() => setSaveMessage(null), 3000);
        setIsScanningEmails(false);
        setScanProgress(null);
        return;
      }
      
      setScanProgress({ step: 'Loading existing items...', current: 2, total: 4 });
      const existingItems = await loadExistingItems(user.uid);
      
      setScanProgress({ step: `Analyzing ${emails.length} emails with AI...`, current: 3, total: 4 });
      const result = await analyzeEmails(emails, existingItems);
      
      setScanProgress({ step: 'Done!', current: 4, total: 4 });
      
      if (result.items.length === 0) {
        setSaveMessage({ type: 'success', text: 'No actionable items found in emails' });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setAnalysisResult(result);
        setSelectedItems(new Set(result.items.map(item => item.id)));
        setShowReviewModal(true);
      }
    } catch (err) {
      console.error('Email scan failed:', err);
      setSaveMessage({ type: 'error', text: 'Failed to scan emails. Please try again.' });
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsScanningEmails(false);
      setScanProgress(null);
    }
  };

  const handleImportSelectedItems = async () => {
    if (!user || !analysisResult || isImporting) return;
    
    const itemsToImport = analysisResult.items.filter(item => selectedItems.has(item.id));
    if (itemsToImport.length === 0) {
      setSaveMessage({ type: 'error', text: 'No items selected' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    
    setIsImporting(true);
    try {
      const { getDb } = await import('@/lib/firebase');
      const { collection, addDoc, Timestamp } = await import('firebase/firestore');
      const { GmailService } = await import('@/lib/integrations/gmail');
      
      const db = getDb();
      const gmailService = new GmailService(user.uid);
      let importedCount = 0;
      const emailIdsToMark: string[] = [];
      
      for (const item of itemsToImport) {
        try {
          const baseData = {
            userId: user.uid,
            title: item.title,
            description: item.description || '',
            priority: item.priority,
            status: 'not_started' as const,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            emailSource: {
              emailId: item.emailId,
              subject: item.sourceSubject,
              sender: item.senderName,
              importedAt: Timestamp.now()
            }
          };
          
          if (item.type === 'task') {
            const taskData: Record<string, any> = {
              ...baseData,
              type: 'task',
              estimatedMinutes: item.estimatedMinutes || 30,
              estimatedSource: 'ai',
              actualMinutes: 0,
              blockedBy: [],
              blocking: [],
              reminders: [],
              tags: ['email-import'],
              syncStatus: 'synced'
            };
            // Only add dueDate if it exists (Firestore doesn't accept undefined)
            if (item.deadline) {
              taskData.dueDate = Timestamp.fromDate(new Date(item.deadline));
            }
            await addDoc(collection(db, 'users', user.uid, 'tasks'), taskData);
          } else if (item.type === 'project') {
            const projectData: Record<string, any> = {
              ...baseData,
              type: 'project',
              milestones: [],
              dependencies: [],
              progress: 0,
              taskCount: 0,
              completedTaskCount: 0,
              actualHours: 0,
              tags: ['email-import'],
              syncStatus: 'synced'
            };
            await addDoc(collection(db, 'users', user.uid, 'projects'), projectData);
          }
          // Add goal/habit support here if needed
          
          if (item.emailId) {
            emailIdsToMark.push(item.emailId);
          }
          importedCount++;
        } catch (err) {
          console.error('Failed to import item:', item.title, err);
        }
      }
      
      // Mark emails as processed
      if (emailIdsToMark.length > 0) {
        await gmailService.markEmailsAsProcessed(emailIdsToMark);
      }
      
      setShowReviewModal(false);
      setAnalysisResult(null);
      setSelectedItems(new Set());
      setSaveMessage({ 
        type: 'success', 
        text: `Imported ${importedCount} item${importedCount !== 1 ? 's' : ''} from emails!` 
      });
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err) {
      console.error('Import failed:', err);
      setSaveMessage({ type: 'error', text: 'Failed to import items' });
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsImporting(false);
    }
  };

  // Show loading while checking auth or loading settings
  if (!authChecked || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-text-muted">Loading settings...</p>
        </div>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Settings</h1>
          <p className="text-text-secondary mt-1">Manage your preferences and account</p>
        </div>
        {hasUnsavedChanges && (
          <Button onClick={handleSaveSettings} isLoading={isSaving}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            Save Changes
          </Button>
        )}
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
              onToggle={(enabled) => updateSettings(prev => ({
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
              onToggle={(enabled) => updateSettings(prev => ({
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
              onToggle={(urgentReminders) => updateSettings(prev => ({
                ...prev,
                notifications: { ...prev.notifications, urgentReminders }
              }))}
              label="Urgent Reminders"
              description="Get notified about urgent tasks"
            />
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-text">Push Notifications</p>
                <p className="text-sm text-text-secondary">
                  {!pushSupported 
                    ? 'Not supported in this browser' 
                    : pushPermission === 'denied' 
                      ? 'Blocked - enable in browser settings'
                      : 'Receive browser push notifications'
                  }
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isSubscribingPush && (
                  <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                )}
                <button
                  onClick={handlePushToggle}
                  disabled={!pushSupported || pushPermission === 'denied' || isSubscribingPush}
                  className={`w-12 h-6 rounded-full relative transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    settings.notifications.pushNotifications ? 'bg-primary' : 'bg-surface-hover'
                  }`}
                >
                  <span 
                    className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                      settings.notifications.pushNotifications ? 'right-1 bg-white' : 'left-1 bg-text-muted'
                    }`}
                  />
                </button>
              </div>
            </div>
            {settings.notifications.pushNotifications && pushSupported && (
              <div className="py-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => showLocalNotification('Test Notification', {
                    body: 'Push notifications are working! 🎉',
                    tag: 'test'
                  })}
                >
                  🔔 Send Test Notification
                </Button>
              </div>
            )}
            <ToggleSwitch
              enabled={settings.notifications.emailNotifications}
              onToggle={(emailNotifications) => updateSettings(prev => ({
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
                  onChange={(e) => updateSettings(prev => ({
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
                  onChange={(e) => updateSettings(prev => ({
                    ...prev,
                    workingHours: { ...prev.workingHours, end: e.target.value }
                  }))}
                />
              </div>
            </div>
            
            {/* Working Days Selection */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">Working Days</label>
              <p className="text-sm text-text-secondary mb-3">Select the days you're available to work</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { day: 0, label: 'Sun' },
                  { day: 1, label: 'Mon' },
                  { day: 2, label: 'Tue' },
                  { day: 3, label: 'Wed' },
                  { day: 4, label: 'Thu' },
                  { day: 5, label: 'Fri' },
                  { day: 6, label: 'Sat' },
                ].map(({ day, label }) => {
                  const isSelected = (settings.workingDays || [1, 2, 3, 4, 5]).includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => updateSettings(prev => {
                        const currentDays = prev.workingDays || [1, 2, 3, 4, 5];
                        const newDays = isSelected 
                          ? currentDays.filter(d => d !== day)
                          : [...currentDays, day].sort();
                        return { ...prev, workingDays: newDays };
                      })}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        isSelected 
                          ? 'bg-primary text-white' 
                          : 'bg-surface-hover text-text-secondary hover:text-text'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-text mb-2">Timezone</label>
              <p className="text-text-secondary">{settings.timezone}</p>
            </div>
          </CardContent>
        </Card>

        {/* Gmail Integration */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              Email Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-text-secondary">
              Connect your Gmail to automatically scan for actionable items and import them as tasks or projects.
            </p>
            
            {isCheckingGmail ? (
              <div className="flex items-center gap-2 text-text-muted">
                <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                <span>Checking connection...</span>
              </div>
            ) : gmailStatus.connected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-success/10 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-success">Gmail Connected</p>
                    <p className="text-sm text-text-muted">{gmailStatus.email}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleGmailDisconnect}
                  >
                    Disconnect
                  </Button>
                </div>
                
                {!isScanningEmails ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => handleScanEmails('week')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                      Scan Last Week
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleScanEmails('3months')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      Scan Last 3 Months
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                      <span className="text-sm">{scanProgress?.step || 'Processing...'}</span>
                    </div>
                    {scanProgress && (
                      <div className="w-full bg-surface-hover rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Button
                onClick={handleGmailConnect}
                isLoading={isConnectingGmail}
                className="flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                Connect Gmail
              </Button>
            )}
            
            <p className="text-xs text-text-muted">
              We only read email metadata (subject, sender, date) to identify actionable items. 
              Email content is analyzed locally and never stored.
            </p>
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
            
            {/* Data Export */}
            <div className="pt-4 border-t border-border">
              <p className="font-medium text-text mb-2">Export Your Data</p>
              <p className="text-sm text-text-secondary mb-3">
                Download all your tasks, habits, projects, goals, and notes.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => handleExportData('json')}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  )}
                  Export JSON
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => handleExportData('csv')}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                      <polyline points="10 9 9 9 8 9"/>
                    </svg>
                  )}
                  Export CSV
                </Button>
              </div>
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

      {/* Email Review Modal */}
      {showReviewModal && analysisResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl shadow-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-text">Review Discovered Items</h2>
                  <p className="text-sm text-text-muted mt-1">
                    Found {analysisResult.items.length} actionable items in {analysisResult.emailsProcessed} emails
                  </p>
                </div>
                <button 
                  onClick={() => setShowReviewModal(false)}
                  className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedItems(new Set(analysisResult.items.map(i => i.id)))}
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedItems(new Set())}
                >
                  Deselect All
                </Button>
                <span className="text-sm text-text-muted ml-auto">
                  {selectedItems.size} selected
                </span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {analysisResult.items.map(item => (
                <div 
                  key={item.id}
                  className={`p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    selectedItems.has(item.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-surface-hover/50 hover:border-text-muted'
                  }`}
                  onClick={() => {
                    const newSelected = new Set(selectedItems);
                    if (newSelected.has(item.id)) {
                      newSelected.delete(item.id);
                    } else {
                      newSelected.add(item.id);
                    }
                    setSelectedItems(newSelected);
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selectedItems.has(item.id) 
                        ? 'border-primary bg-primary' 
                        : 'border-text-muted'
                    }`}>
                      {selectedItems.has(item.id) && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-text">{item.title}</span>
                        <Badge variant={item.type === 'task' ? 'primary' : 'success'} className="text-xs">
                          {item.type}
                        </Badge>
                        <Badge 
                          variant={item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'secondary'}
                          className="text-xs"
                        >
                          {item.priority}
                        </Badge>
                        {item.urgency === 'urgent' && (
                          <Badge variant="danger" className="text-xs">⚡ Urgent</Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-sm text-text-secondary mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                        <span>From: {item.senderName}</span>
                        {item.deadline && (
                          <span>Due: {new Date(item.deadline).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-4 border-t border-border flex items-center justify-between gap-4">
              <Button
                variant="ghost"
                onClick={() => setShowReviewModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleImportSelectedItems}
                isLoading={isImporting}
                disabled={selectedItems.size === 0}
              >
                Import {selectedItems.size} Item{selectedItems.size !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
