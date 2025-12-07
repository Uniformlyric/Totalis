import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAuthInstance, getDb } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { subscribeToTasks } from '@/lib/db/tasks';
import { subscribeToHabits } from '@/lib/db/habits';
import { subscribeToMilestones } from '@/lib/db/milestones';
import { CalendarView } from './CalendarView';
import { TimeBlockView } from './TimeBlockView';
import { TaskModal } from '@/components/tasks/TaskModal';
import { Button, Card } from '@/components/ui';
import type { Task, Habit, HabitLog, UserSettings, Milestone } from '@totalis/shared';
import type { SchedulePreview, WorkingSchedule } from '@/lib/ai/auto-scheduler';

type ViewMode = 'month' | 'day';

// Schedule Preview Modal Component
function SchedulePreviewModal({
  previews,
  onConfirm,
  onCancel,
  isLoading,
}: {
  previews: SchedulePreview[];
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const totalTasks = previews.reduce((sum, p) => sum + p.slots.length, 0);
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-text">Review Schedule</h2>
          <p className="text-text-secondary text-sm mt-1">
            {totalTasks} task{totalTasks !== 1 ? 's' : ''} scheduled across {previews.length} day{previews.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Schedule Preview */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {previews.map((preview, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className="font-medium text-text flex items-center gap-2">
                <span className="text-lg">📅</span>
                {preview.date.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </h3>
              
              {preview.slots.map((slot, slotIdx) => (
                <div 
                  key={slotIdx} 
                  className="flex items-center gap-4 p-3 bg-surface-hover rounded-lg"
                >
                  <div className="text-sm font-mono text-text-secondary w-28">
                    {slot.startTime.toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit' 
                    })} - {slot.endTime.toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit' 
                    })}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-text">{slot.task.title}</div>
                    <div className="text-xs text-text-secondary">{slot.reasoning}</div>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-xs font-medium ${
                    slot.task.priority === 'urgent' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                    slot.task.priority === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {slot.task.priority || 'medium'}
                  </div>
                </div>
              ))}
              
              {preview.warnings.length > 0 && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="text-sm text-yellow-700 dark:text-yellow-300">
                    ⚠️ {preview.warnings.join(', ')}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Applying...' : '✅ Apply Schedule'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Reschedule Time Period Selection Modal
function RescheduleModal({
  onSelect,
  onCancel,
}: {
  onSelect: (mode: 'week' | 'month' | 'year') => void;
  onCancel: () => void;
}) {
  const [selectedMode, setSelectedMode] = useState<'week' | 'month' | 'year'>('month');
  
  const options = [
    { value: 'week' as const, label: 'Current Week', description: 'Reschedule tasks for this week (Mon-Sun)', icon: '📅' },
    { value: 'month' as const, label: 'Current Month', description: 'Reschedule all tasks for this month', icon: '📆' },
    { value: 'year' as const, label: 'Full Year', description: 'Reschedule tasks across the entire year', icon: '🗓️' },
  ];
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-text">Reschedule Tasks</h2>
          <p className="text-text-secondary text-sm mt-1">
            Choose the time period to reschedule
          </p>
        </div>

        {/* Options */}
        <div className="p-6 space-y-3">
          {options.map((option) => (
            <label
              key={option.value}
              className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-colors border-2 ${
                selectedMode === option.value
                  ? 'border-primary bg-primary/10'
                  : 'border-transparent bg-surface-hover hover:bg-surface-hover/80'
              }`}
            >
              <input
                type="radio"
                name="reschedule-mode"
                value={option.value}
                checked={selectedMode === option.value}
                onChange={() => setSelectedMode(option.value)}
                className="sr-only"
              />
              <span className="text-2xl">{option.icon}</span>
              <div className="flex-1">
                <div className="font-medium text-text">{option.label}</div>
                <div className="text-sm text-text-secondary">{option.description}</div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                selectedMode === option.value
                  ? 'border-primary bg-primary'
                  : 'border-text-secondary'
              }`}>
                {selectedMode === option.value && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSelect(selectedMode)}>
            🔄 Reschedule
          </Button>
        </div>
      </div>
    </div>
  );
}

// Unschedule Modal Component
function UnscheduleModal({
  onConfirm,
  onCancel,
  isLoading,
}: {
  onConfirm: (scope: 'all' | 'month' | 'year') => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [selectedScope, setSelectedScope] = useState<'all' | 'month' | 'year'>('month');
  
  const options = [
    { value: 'month' as const, label: 'Current Month', description: 'Clear schedule for this month only', icon: '📆', danger: false },
    { value: 'year' as const, label: 'Current Year', description: 'Clear schedule for the entire year', icon: '🗓️', danger: true },
    { value: 'all' as const, label: 'Everything', description: 'Clear ALL scheduled times from ALL tasks', icon: '🗑️', danger: true },
  ];
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-text">Unschedule Tasks</h2>
          <p className="text-text-secondary text-sm mt-1">
            Remove scheduled times from tasks. This action cannot be undone.
          </p>
        </div>

        {/* Options */}
        <div className="p-6 space-y-3">
          {options.map((option) => (
            <label
              key={option.value}
              className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-colors border-2 ${
                selectedScope === option.value
                  ? option.danger ? 'border-red-500 bg-red-500/10' : 'border-primary bg-primary/10'
                  : 'border-transparent bg-surface-hover hover:bg-surface-hover/80'
              }`}
            >
              <input
                type="radio"
                name="unschedule-scope"
                value={option.value}
                checked={selectedScope === option.value}
                onChange={() => setSelectedScope(option.value)}
                className="sr-only"
              />
              <span className="text-2xl">{option.icon}</span>
              <div className="flex-1">
                <div className="font-medium text-text">{option.label}</div>
                <div className="text-sm text-text-secondary">{option.description}</div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                selectedScope === option.value
                  ? option.danger ? 'border-red-500 bg-red-500' : 'border-primary bg-primary'
                  : 'border-text-secondary'
              }`}>
                {selectedScope === option.value && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={() => onConfirm(selectedScope)} 
            disabled={isLoading}
            className={selectedScope !== 'month' ? '!bg-red-500 hover:!bg-red-600' : ''}
          >
            {isLoading ? '⏳ Unscheduling...' : '🗑️ Unschedule'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CalendarPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Auto-scheduler state
  const [schedulePreview, setSchedulePreview] = useState<SchedulePreview[] | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isApplyingSchedule, setIsApplyingSchedule] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showUnscheduleModal, setShowUnscheduleModal] = useState(false);
  const [isUnscheduling, setIsUnscheduling] = useState(false);

  // Working schedule (loaded from user settings)
  const [workingSchedule, setWorkingSchedule] = useState<WorkingSchedule>({
    days: [1, 2, 3, 4, 5], // Mon-Fri
    hours: { start: '09:00', end: '17:00' },
  });

  // Auth state listener
  useEffect(() => {
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, []);

  // Load user settings
  useEffect(() => {
    const loadSettings = async () => {
      if (!user) return;
      
      try {
        const db = getDb();
        const settingsRef = doc(db, 'users', user.uid, 'settings', 'preferences');
        const settingsDoc = await getDoc(settingsRef);
        
        if (settingsDoc.exists()) {
          const settings = settingsDoc.data() as UserSettings;
          setWorkingSchedule({
            days: settings.workingDays || [1, 2, 3, 4, 5],
            hours: settings.workingHours || { start: '09:00', end: '17:00' },
          });
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    
    loadSettings();
  }, [user]);

  // Subscribe to tasks and habits
  useEffect(() => {
    if (!authChecked || !user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const unsubTasks = subscribeToTasks((updatedTasks) => {
      setTasks(updatedTasks);
      setIsLoading(false);
    });

    const unsubHabits = subscribeToHabits(user.uid, (updatedHabits) => {
      setHabits(updatedHabits.filter((h) => !h.isArchived));
    });

    const unsubMilestones = subscribeToMilestones(user.uid, (updatedMilestones) => {
      setMilestones(updatedMilestones);
    });

    // TODO: Load habit logs for visible date range
    // For now, we'll just use empty array

    return () => {
      unsubTasks();
      unsubHabits();
      unsubMilestones();
    };
  }, [user, authChecked]);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setViewMode('day');
  };

  const handleCreateTask = (scheduledStart: Date) => {
    // Open modal with pre-filled scheduledStart
    setSelectedTask({
      scheduledStart,
      dueDate: scheduledStart,
    } as Task);
    setIsModalOpen(true);
  };

  const handleUpdateTask = async (taskData: Partial<Task>) => {
    // Convert Date objects to Firestore Timestamps
    const { Timestamp } = await import('firebase/firestore');
    const cleanData = { ...taskData };
    
    if (cleanData.scheduledStart instanceof Date) {
      cleanData.scheduledStart = Timestamp.fromDate(cleanData.scheduledStart);
    }
    if (cleanData.dueDate instanceof Date) {
      cleanData.dueDate = Timestamp.fromDate(cleanData.dueDate);
    }

    if (!cleanData.id) {
      // New task
      const { createTask } = await import('@/lib/db/tasks');
      if (user) {
        await createTask({ ...cleanData, userId: user.uid } as Task);
      }
      return;
    }

    const { updateTask } = await import('@/lib/db/tasks');
    await updateTask(cleanData.id, cleanData);
  };

  // Handler for TimeBlockView drag-and-drop (different signature)
  const handleTimeBlockUpdate = async (taskId: string, updates: Partial<Task>) => {
    // Convert Date objects to Firestore Timestamps
    const { Timestamp } = await import('firebase/firestore');
    const cleanData = { ...updates };
    
    if (cleanData.scheduledStart instanceof Date) {
      cleanData.scheduledStart = Timestamp.fromDate(cleanData.scheduledStart);
    }
    if (cleanData.dueDate instanceof Date) {
      cleanData.dueDate = Timestamp.fromDate(cleanData.dueDate);
    }

    const { updateTask } = await import('@/lib/db/tasks');
    await updateTask(taskId, cleanData);
  };

  const handleDeleteTask = async (taskId: string) => {
    const { deleteTask } = await import('@/lib/db/tasks');
    await deleteTask(taskId);
  };

  const handleAutoSchedule = async (mode: 'day' | 'week' = 'day') => {
    if (!user) return;
    
    setIsScheduling(true);
    
    try {
      if (mode === 'day') {
        // Import AI scheduler
        const { generateSchedulePreview } = await import('@/lib/ai/auto-scheduler');
        
        // Get unscheduled tasks for the selected date
        const dateStr = selectedDate.toISOString().split('T')[0];
        const unscheduledTasks = tasks.filter(t => {
          const dueDate = t.dueDate instanceof Date ? t.dueDate : t.dueDate?.toDate?.();
          if (!dueDate) return false;
          return dueDate.toISOString().split('T')[0] === dateStr && !t.scheduledStart;
        });

        if (unscheduledTasks.length === 0) {
          // Also try tasks without due date or due in the future
          const allUnscheduled = tasks.filter(t => 
            !t.scheduledStart && t.status !== 'completed'
          );
          
          if (allUnscheduled.length === 0) {
            alert('No unscheduled tasks to schedule!');
            setIsScheduling(false);
            return;
          }
          
          // Use first 10 unscheduled tasks
          const tasksToSchedule = allUnscheduled.slice(0, 10);
          
          const scheduledTasks = tasks.filter(t => {
            const startDate = t.scheduledStart instanceof Date ? t.scheduledStart : t.scheduledStart?.toDate?.();
            if (!startDate) return false;
            return startDate.toISOString().split('T')[0] === dateStr;
          });

          const preview = await generateSchedulePreview(
            tasksToSchedule,
            scheduledTasks,
            selectedDate,
            workingSchedule.hours
          );
          
          setSchedulePreview([preview]);
        } else {
          // Get already scheduled tasks for capacity check
          const scheduledTasks = tasks.filter(t => {
            const startDate = t.scheduledStart instanceof Date ? t.scheduledStart : t.scheduledStart?.toDate?.();
            if (!startDate) return false;
            return startDate.toISOString().split('T')[0] === dateStr;
          });

          const preview = await generateSchedulePreview(
            unscheduledTasks,
            scheduledTasks,
            selectedDate,
            workingSchedule.hours
          );
          
          setSchedulePreview([preview]);
        }
      } else {
        // Week scheduling
        const { generateWeekSchedulePreview } = await import('@/lib/ai/auto-scheduler');
        
        // Start from today or selected date
        const startDate = new Date(selectedDate);
        startDate.setHours(0, 0, 0, 0);
        
        const previews = await generateWeekSchedulePreview(
          tasks,
          startDate,
          workingSchedule
        );
        
        if (previews.length === 0) {
          alert('No tasks could be scheduled for this week!');
          setIsScheduling(false);
          return;
        }
        
        setSchedulePreview(previews);
      }
    } catch (error) {
      console.error('Auto-schedule failed:', error);
      alert('Failed to generate schedule. Please try again.');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleAutoScheduleMonth = async () => {
    if (!user) return;
    
    setIsScheduling(true);
    
    try {
      const { generateMonthSchedulePreview } = await import('@/lib/ai/auto-scheduler');
      
      // Start from today
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      
      const previews = await generateMonthSchedulePreview(
        tasks,
        startDate,
        workingSchedule,
        milestones // Pass milestones for smart ordering
      );
      
      if (previews.length === 0) {
        alert('No tasks could be scheduled for this month!');
        setIsScheduling(false);
        return;
      }
      
      setSchedulePreview(previews);
    } catch (error) {
      console.error('Month auto-schedule failed:', error);
      alert('Failed to generate schedule. Please try again.');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleAutoScheduleYear = async () => {
    if (!user) return;
    
    if (!confirm('This will schedule all unscheduled tasks across the entire year. This may take a moment. Continue?')) {
      return;
    }
    
    setIsScheduling(true);
    
    try {
      const { generateYearSchedulePreview } = await import('@/lib/ai/auto-scheduler');
      
      // Start from today
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      
      const previews = await generateYearSchedulePreview(
        tasks,
        startDate,
        workingSchedule,
        milestones
      );
      
      if (previews.length === 0) {
        alert('No tasks could be scheduled for the year!');
        setIsScheduling(false);
        return;
      }
      
      setSchedulePreview(previews);
    } catch (error) {
      console.error('Year auto-schedule failed:', error);
      alert('Failed to generate schedule. Please try again.');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleReschedule = async (mode: 'day' | 'week' | 'month' | 'year') => {
    if (!user) return;
    
    const confirmMsgs: Record<typeof mode, string> = {
      day: 'This will clear and re-optimize the schedule for today. Continue?',
      week: 'This will clear and re-optimize the schedule for this entire week. Continue?',
      month: 'This will clear and re-optimize the schedule for the entire month. Continue?',
      year: 'This will clear and re-optimize the schedule for the entire year. This may take a while. Continue?',
    };
    
    if (!confirm(confirmMsgs[mode])) return;
    
    setIsScheduling(true);
    
    try {
      if (mode === 'day') {
        const { rescheduleDay } = await import('@/lib/ai/auto-scheduler');
        const preview = await rescheduleDay(tasks, selectedDate, workingSchedule);
        setSchedulePreview([preview]);
      } else if (mode === 'week') {
        const { rescheduleWeek } = await import('@/lib/ai/auto-scheduler');
        const startDate = new Date(selectedDate);
        // Find start of week (Monday)
        const day = startDate.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        startDate.setDate(startDate.getDate() + diff);
        startDate.setHours(0, 0, 0, 0);
        
        const previews = await rescheduleWeek(tasks, startDate, workingSchedule);
        if (previews.length === 0) {
          alert('No tasks to reschedule for this week!');
          setIsScheduling(false);
          return;
        }
        setSchedulePreview(previews);
      } else if (mode === 'month') {
        const { rescheduleMonth } = await import('@/lib/ai/auto-scheduler');
        const startDate = new Date();
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        
        const previews = await rescheduleMonth(tasks, startDate, workingSchedule, milestones);
        if (previews.length === 0) {
          alert('No tasks to reschedule for this month!');
          setIsScheduling(false);
          return;
        }
        setSchedulePreview(previews);
      } else {
        // Year mode - reschedule all months
        const { generateYearSchedulePreview } = await import('@/lib/ai/auto-scheduler');
        const startDate = new Date();
        startDate.setMonth(0);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        
        const previews = await generateYearSchedulePreview(tasks, startDate, workingSchedule, milestones);
        if (previews.length === 0) {
          alert('No tasks to reschedule for this year!');
          setIsScheduling(false);
          return;
        }
        setSchedulePreview(previews);
      }
    } catch (error) {
      console.error(`Reschedule ${mode} failed:`, error);
      alert(`Failed to reschedule ${mode}. Please try again.`);
    } finally {
      setIsScheduling(false);
    }
  };
  
  const handleRescheduleModalSelect = (mode: 'week' | 'month' | 'year') => {
    setShowRescheduleModal(false);
    handleReschedule(mode);
  };
  
  const handleUnschedule = async (scope: 'all' | 'month' | 'year') => {
    setIsUnscheduling(true);
    
    try {
      const { unscheduleAllTasks } = await import('@/lib/ai/auto-scheduler');
      const count = await unscheduleAllTasks(tasks, scope);
      setShowUnscheduleModal(false);
      alert(`✅ Unscheduled ${count} task${count !== 1 ? 's' : ''}!`);
    } catch (error) {
      console.error('Unschedule failed:', error);
      alert('Failed to unschedule tasks. Please try again.');
    } finally {
      setIsUnscheduling(false);
    }
  };
  
  const handleApplySchedule = async () => {
    if (!schedulePreview) return;
    
    setIsApplyingSchedule(true);
    
    try {
      const { applySchedulePreview } = await import('@/lib/ai/auto-scheduler');
      
      for (const preview of schedulePreview) {
        await applySchedulePreview(preview);
      }
      
      const totalTasks = schedulePreview.reduce((sum, p) => sum + p.slots.length, 0);
      alert(`✅ Successfully scheduled ${totalTasks} task${totalTasks !== 1 ? 's' : ''}!`);
      setSchedulePreview(null);
    } catch (error) {
      console.error('Apply schedule failed:', error);
      alert('Failed to apply schedule. Please try again.');
    } finally {
      setIsApplyingSchedule(false);
    }
  };

  // Show login prompt if not authenticated
  if (authChecked && !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-surface flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-text mb-2">Sign in to view calendar</h2>
          <p className="text-text-secondary mb-6">
            See your tasks and habits at a glance
          </p>
          <a
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 font-medium rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-surface-hover rounded" />
          <div className="h-10 w-32 bg-surface-hover rounded" />
        </div>
        <div className="bg-surface-hover rounded-xl h-[500px]" />
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text mb-2">Calendar</h1>
          <p className="text-text-secondary">
            {viewMode === 'month' 
              ? 'View your tasks and habits at a glance'
              : `Time blocking for ${selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`
            }
          </p>
        </div>
        
        {/* View Mode Toggle */}
        <div className="flex gap-2 flex-wrap justify-end">
          {viewMode === 'day' && (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleAutoSchedule('day')}
                disabled={isScheduling}
              >
                {isScheduling ? '⏳...' : '🤖 Schedule Day'}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleReschedule('day')}
                disabled={isScheduling}
              >
                🔄 Reschedule Day
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleReschedule('week')}
                disabled={isScheduling}
              >
                🔄 Reschedule Week
              </Button>
              <div className="w-px bg-border mx-1" />
            </>
          )}
          {viewMode === 'month' && (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={handleAutoScheduleMonth}
                disabled={isScheduling}
              >
                {isScheduling ? '⏳ Generating...' : '📆 Schedule Month'}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleAutoScheduleYear}
                disabled={isScheduling}
              >
                📅 Schedule Year
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowRescheduleModal(true)}
                disabled={isScheduling}
              >
                🔄 Reschedule...
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowUnscheduleModal(true)}
                disabled={isScheduling || isUnscheduling}
                className="!text-red-500 hover:!bg-red-50 dark:hover:!bg-red-900/20"
              >
                🗑️ Unschedule...
              </Button>
              <div className="w-px bg-border mx-1" />
            </>
          )}
          <Button
            variant={viewMode === 'month' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setViewMode('month')}
          >
            Month
          </Button>
          <Button
            variant={viewMode === 'day' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setViewMode('day')}
          >
            Day
          </Button>
        </div>
      </div>

      {/* Calendar Views */}
      {viewMode === 'month' ? (
        <CalendarView
          tasks={tasks}
          habits={habits}
          habitLogs={habitLogs}
          workingHours={workingSchedule.hours}
          onDayClick={handleDayClick}
          onTaskClick={handleTaskClick}
        />
      ) : (
        <TimeBlockView
          date={selectedDate}
          tasks={tasks}
          habits={habits}
          onTaskUpdate={handleTimeBlockUpdate}
          onTaskClick={handleTaskClick}
          onCreateTask={handleCreateTask}
        />
      )}

      {/* Task Modal */}
      <TaskModal
        task={selectedTask}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTask(null);
        }}
        onSave={handleUpdateTask}
        onDelete={handleDeleteTask}
        mode={selectedTask?.id ? 'edit' : 'create'}
      />
      
      {/* Schedule Preview Modal */}
      {schedulePreview && (
        <SchedulePreviewModal
          previews={schedulePreview}
          onConfirm={handleApplySchedule}
          onCancel={() => setSchedulePreview(null)}
          isLoading={isApplyingSchedule}
        />
      )}
      
      {/* Reschedule Time Period Modal */}
      {showRescheduleModal && (
        <RescheduleModal
          onSelect={handleRescheduleModalSelect}
          onCancel={() => setShowRescheduleModal(false)}
        />
      )}
      
      {/* Unschedule Modal */}
      {showUnscheduleModal && (
        <UnscheduleModal
          onConfirm={handleUnschedule}
          onCancel={() => setShowUnscheduleModal(false)}
          isLoading={isUnscheduling}
        />
      )}
    </div>
  );
}
