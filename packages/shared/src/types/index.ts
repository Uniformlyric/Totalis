// ============================================
// TOTALIS TYPE DEFINITIONS
// Sync with: apps/mobile/lib/models/
// ============================================

export interface User {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  fcmTokens: string[];
  webPushSubscriptions: WebPushSubscription[];
  settings: UserSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
  createdAt: Date;
  userAgent: string;
}

export interface UserSettings {
  theme: 'celestial' | 'sunset' | 'system';
  notifications: NotificationSettings;
  workingHours: { start: string; end: string };
  weeklyCapacity: number;
  timezone: string;
}

export interface NotificationSettings {
  morningSummary: { enabled: boolean; time: string };
  eveningRecap: { enabled: boolean; time: string };
  urgentReminders: boolean;
  gentleReminders: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  deadline?: Date;
  status: 'active' | 'completed' | 'archived' | 'blocked';
  progress: number;
  timeframe: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  icon?: string;
  tags: string[];
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  userId: string;
  goalId?: string;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'archived' | 'blocked';
  progress: number;
  taskCount: number;
  completedTaskCount: number;
  startDate?: Date;
  deadline?: Date;
  estimatedHours: number;
  actualHours: number;
  tags: string[];
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  userId: string;
  projectId?: string;
  goalId?: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedMinutes: number;
  estimatedSource: 'ai' | 'manual';
  actualMinutes?: number;
  dueDate?: Date;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  completedAt?: Date;
  blockedBy: string[];
  blocking: string[];
  recurrence?: TaskRecurrence;
  reminders: TaskReminder[];
  tags: string[];
  notes?: string;
  localId?: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskRecurrence {
  pattern: 'daily' | 'weekly' | 'monthly' | 'custom';
  interval: number;
  daysOfWeek?: number[];
  endDate?: Date;
  nextOccurrence?: Date;
}

export interface TaskReminder {
  id: string;
  type: 'before_due' | 'before_scheduled' | 'custom';
  minutes: number;
  sent: boolean;
  sentAt?: Date;
}

export interface Habit {
  id: string;
  userId: string;
  title: string;
  description?: string;
  frequency: 'daily' | 'weekly' | 'custom';
  daysOfWeek?: number[];
  targetPerDay?: number;
  reminderTime?: string;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  color: string;
  icon?: string;
  tags: string[];
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface HabitLog {
  id: string;
  habitId: string;
  userId: string;
  date: string;
  completed: boolean;
  value?: number;
  notes?: string;
  createdAt: Date;
}

export interface Note {
  id: string;
  userId: string;
  taskId?: string;
  projectId?: string;
  goalId?: string;
  title: string;
  content: string;
  tags: string[];
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FocusSession {
  id: string;
  userId: string;
  taskId?: string;
  type: 'pomodoro' | 'custom';
  plannedDuration: number;
  actualDuration: number;
  status: 'completed' | 'interrupted' | 'in_progress';
  startedAt: Date;
  endedAt?: Date;
  notes?: string;
}

export interface DailyStats {
  id: string;
  userId: string;
  date: string;
  tasksCompleted: number;
  tasksCreated: number;
  totalTasksScheduled: number;
  focusMinutes: number;
  estimatedMinutes: number;
  actualMinutes: number;
  habitsCompleted: number;
  totalHabitsScheduled: number;
  productivityScore: number;
  completionRate: number;
}

// Gemini AI Types
export interface GeminiTimeEstimate {
  estimatedMinutes: number;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  basedOn: string[];
}

export interface GeminiTaskBreakdown {
  subtasks: GeminiSubtask[];
  totalEstimatedMinutes: number;
  suggestedSchedule: GeminiSuggestedDay[];
}

export interface GeminiSubtask {
  title: string;
  estimatedMinutes: number;
  dependencies: number[];
  priority: 'low' | 'medium' | 'high';
}

export interface GeminiSuggestedDay {
  dayOffset: number;
  date: string;
  taskIndices: number[];
  totalMinutes: number;
}

export interface GeminiInsight {
  type: 'warning' | 'suggestion' | 'achievement';
  title: string;
  description: string;
  actionable: boolean;
  action?: {
    label: string;
    type: 'rebalance' | 'reschedule' | 'focus' | 'celebrate';
    data?: Record<string, unknown>;
  };
}
