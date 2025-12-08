import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Checkbox } from '@/components/ui';
import { CompletionCelebration, TaskModal } from '@/components/tasks';
import { HabitModal } from '@/components/habits';
import { NoteModal } from '@/components/notes';
import { OnboardingModal } from '@/components/onboarding';
import type { Task, Habit, HabitLog, Project, Goal, Note, Milestone } from '@totalis/shared';
import type { User } from 'firebase/auth';

// ============================================================================
// TYPES
// ============================================================================

interface ScheduledItem {
  id: string;
  title: string;
  type: 'task' | 'habit' | 'event';
  startTime: Date;
  endTime: Date;
  priority?: string;
  projectId?: string;
  projectTitle?: string;
  projectColor?: string;
  dueDate?: Date;
  estimatedMinutes?: number;
  completed?: boolean;
  color?: string;
}

// ============================================================================
// HERO COMPONENT - Current/Next Focus
// ============================================================================

interface HeroSectionProps {
  currentItem: ScheduledItem | null;
  nextItem: ScheduledItem | null;
  onCompleteTask: (id: string) => void;
  timeUntilNext: string;
}

function HeroSection({ currentItem, nextItem, onCompleteTask, timeUntilNext }: HeroSectionProps) {
  const now = new Date();
  
  if (!currentItem && !nextItem) {
    return (
      <Card className="bg-gradient-to-br from-primary/20 via-surface to-accent/10 border-none">
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-text mb-2">You're all caught up!</h2>
          <p className="text-text-secondary">
            No tasks scheduled right now. Enjoy your free time or plan ahead.
          </p>
          <div className="flex gap-3 justify-center mt-6">
            <a href="/tasks">
              <Button variant="primary">Add Task</Button>
            </a>
            <a href="/calendar">
              <Button variant="secondary">View Calendar</Button>
            </a>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-surface to-accent/5 border-none overflow-hidden">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Current Focus */}
        <div className="flex-1 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
            </span>
            <span className="text-sm font-medium text-success uppercase tracking-wide">Now</span>
          </div>
          
          {currentItem ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                {currentItem.type === 'task' && (
                  <button
                    onClick={() => onCompleteTask(currentItem.id)}
                    className="mt-1 w-8 h-8 rounded-full border-2 border-primary hover:bg-primary hover:text-white flex items-center justify-center transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                )}
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-text">{currentItem.title}</h2>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {currentItem.projectTitle && (
                      <div className="flex items-center gap-1.5">
                        <div 
                          className="w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: currentItem.projectColor || '#6366f1' }}
                        />
                        <span className="text-sm text-text-secondary">{currentItem.projectTitle}</span>
                      </div>
                    )}
                    {currentItem.priority && (
                      <Badge variant={
                        currentItem.priority === 'urgent' ? 'danger' :
                        currentItem.priority === 'high' ? 'warning' : 'default'
                      }>
                        {currentItem.priority}
                      </Badge>
                    )}
                    {currentItem.estimatedMinutes && (
                      <span className="text-sm text-text-muted">
                        ⏱ {currentItem.estimatedMinutes} min
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Progress indicator */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">
                    {currentItem.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - 
                    {currentItem.endTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="text-text-muted">
                    {Math.round((now.getTime() - currentItem.startTime.getTime()) / 60000)} min elapsed
                  </span>
                </div>
                <div className="h-2 bg-border rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all duration-1000"
                    style={{ 
                      width: `${Math.min(100, ((now.getTime() - currentItem.startTime.getTime()) / (currentItem.endTime.getTime() - currentItem.startTime.getTime())) * 100)}%` 
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="text-4xl mb-2">☕</div>
              <p className="text-text-secondary">No active task right now</p>
            </div>
          )}
        </div>
        
        {/* Divider */}
        <div className="hidden lg:block w-px bg-border" />
        <div className="lg:hidden h-px bg-border" />
        
        {/* Up Next */}
        <div className="flex-1 p-6 bg-surface-hover/30">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-medium text-text-muted uppercase tracking-wide">Up Next</span>
            {timeUntilNext && (
              <Badge variant="secondary">{timeUntilNext}</Badge>
            )}
          </div>
          
          {nextItem ? (
            <div className="space-y-3">
              <h3 className="text-xl font-semibold text-text">{nextItem.title}</h3>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-text-secondary">
                  {nextItem.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
                {nextItem.projectTitle && (
                  <div className="flex items-center gap-1.5">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: nextItem.projectColor || '#6366f1' }}
                    />
                    <span className="text-sm text-text-muted">{nextItem.projectTitle}</span>
                  </div>
                )}
                {nextItem.dueDate && (
                  <span className="text-sm text-warning">
                    Due {new Date(nextItem.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-text-muted">Nothing else scheduled today</p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// TODAY'S AGENDA - Timeline View
// ============================================================================

interface AgendaTimelineProps {
  items: ScheduledItem[];
  onCompleteTask: (id: string) => void;
  projects: Map<string, { title: string; color: string }>;
}

function AgendaTimeline({ items, onCompleteTask, projects }: AgendaTimelineProps) {
  const now = new Date();
  const currentHour = now.getHours();
  
  // Group items by hour
  const itemsByHour = useMemo(() => {
    const grouped = new Map<number, ScheduledItem[]>();
    items.forEach(item => {
      const hour = item.startTime.getHours();
      if (!grouped.has(hour)) grouped.set(hour, []);
      grouped.get(hour)!.push(item);
    });
    return grouped;
  }, [items]);
  
  // Generate hours from 6 AM to 10 PM
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);
  
  return (
    <Card variant="bordered" padding="none">
      <CardHeader className="px-4 pt-4">
        <CardTitle className="flex items-center gap-2">
          <span>📅</span> Today's Agenda
        </CardTitle>
        <a href="/calendar" className="text-sm text-primary hover:underline">
          Full calendar →
        </a>
      </CardHeader>
      <CardContent className="pb-4 px-0">
        <div className="relative max-h-96 overflow-y-auto">
          {hours.map(hour => {
            const hourItems = itemsByHour.get(hour) || [];
            const isPast = hour < currentHour;
            const isCurrent = hour === currentHour;
            
            return (
              <div 
                key={hour} 
                className={`flex border-b border-border last:border-b-0 ${isPast ? 'opacity-50' : ''}`}
              >
                {/* Hour label */}
                <div className={`w-16 py-3 px-3 text-sm font-mono text-right flex-shrink-0 ${
                  isCurrent ? 'text-primary font-semibold' : 'text-text-muted'
                }`}>
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </div>
                
                {/* Items */}
                <div className="flex-1 py-2 px-3 min-h-[3rem] relative">
                  {isCurrent && (
                    <div className="absolute left-0 top-1/2 w-full h-px bg-primary z-10">
                      <div className="absolute left-0 -top-1 w-2 h-2 rounded-full bg-primary" />
                    </div>
                  )}
                  
                  {hourItems.length > 0 ? (
                    <div className="space-y-2">
                      {hourItems.map(item => (
                        <div 
                          key={item.id}
                          className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                            item.completed ? 'bg-success/10' : 'bg-surface-hover hover:bg-surface-hover/80'
                          }`}
                        >
                          {item.type === 'task' && (
                            <Checkbox
                              checked={item.completed || false}
                              onChange={() => onCompleteTask(item.id)}
                            />
                          )}
                          {item.type === 'habit' && (
                            <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
                              <span className="text-xs">🔁</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium truncate ${item.completed ? 'line-through text-text-muted' : 'text-text'}`}>
                              {item.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-text-muted">
                                {item.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              </span>
                              {item.projectTitle && (
                                <span 
                                  className="text-xs px-1.5 py-0.5 rounded"
                                  style={{ 
                                    backgroundColor: `${item.projectColor}20`,
                                    color: item.projectColor 
                                  }}
                                >
                                  {item.projectTitle}
                                </span>
                              )}
                            </div>
                          </div>
                          {item.priority && item.priority !== 'medium' && (
                            <Badge size="sm" variant={
                              item.priority === 'urgent' ? 'danger' :
                              item.priority === 'high' ? 'warning' : 'default'
                            }>
                              {item.priority}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// PROGRESS RINGS - Visual Stats
// ============================================================================

interface ProgressRingProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  label: string;
  sublabel?: string;
}

function ProgressRing({ value, max, size = 100, strokeWidth = 8, color, label, sublabel }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = max > 0 ? (value / max) * 100 : 0;
  const offset = circumference - (progress / 100) * circumference;
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            className="text-border"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="none"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          <circle
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            r={radius}
            cx={size / 2}
            cy={size / 2}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: offset,
              transition: 'stroke-dashoffset 0.5s ease-in-out',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-text">{value}/{max}</span>
        </div>
      </div>
      <p className="mt-2 font-medium text-text">{label}</p>
      {sublabel && <p className="text-xs text-text-muted">{sublabel}</p>}
    </div>
  );
}

function ProgressRingsSection({ 
  tasksCompleted, 
  tasksTotal, 
  habitsCompleted, 
  habitsTotal,
  focusMinutes 
}: {
  tasksCompleted: number;
  tasksTotal: number;
  habitsCompleted: number;
  habitsTotal: number;
  focusMinutes: number;
}) {
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle>Today's Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-around items-center">
          <ProgressRing
            value={tasksCompleted}
            max={tasksTotal}
            color="#10b981"
            label="Tasks"
            sublabel="completed"
          />
          <ProgressRing
            value={habitsCompleted}
            max={habitsTotal}
            color="#8b5cf6"
            label="Habits"
            sublabel="done"
          />
          <ProgressRing
            value={focusMinutes}
            max={480}
            color="#f59e0b"
            label="Focus"
            sublabel="minutes"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// QUICK ACTIONS
// ============================================================================

interface QuickActionsProps {
  onNewTask: () => void;
  onNewHabit: () => void;
  onNewNote: () => void;
}

function QuickActionsSection({ onNewTask, onNewHabit, onNewNote }: QuickActionsProps) {
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={onNewTask}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover hover:bg-primary/10 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <span className="text-xl">✏️</span>
            </div>
            <span className="font-medium text-text">New Task</span>
          </button>
          <a href="/calendar" className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover hover:bg-accent/10 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
              <span className="text-xl">🗓️</span>
            </div>
            <span className="font-medium text-text">Schedule</span>
          </a>
          <button 
            onClick={onNewHabit}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover hover:bg-warning/10 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
              <span className="text-xl">🔄</span>
            </div>
            <span className="font-medium text-text">New Habit</span>
          </button>
          <button 
            onClick={onNewNote}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover hover:bg-success/10 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center">
              <span className="text-xl">📝</span>
            </div>
            <span className="font-medium text-text">Quick Note</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// UPCOMING DEADLINES
// ============================================================================

interface DeadlineItemProps {
  task: Task;
  project?: { title: string; color: string };
  daysUntil: number;
}

function DeadlineItem({ task, project, daysUntil }: DeadlineItemProps) {
  const urgencyColor = daysUntil <= 1 ? 'text-danger' : daysUntil <= 3 ? 'text-warning' : 'text-text-muted';
  const urgencyBg = daysUntil <= 1 ? 'bg-danger/10' : daysUntil <= 3 ? 'bg-warning/10' : 'bg-surface-hover';
  
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${urgencyBg}`}>
      <div className={`text-2xl ${urgencyColor}`}>
        {daysUntil <= 1 ? '🔴' : daysUntil <= 3 ? '🟡' : '🟢'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-text truncate">{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {project && (
            <span 
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${project.color}20`, color: project.color }}
            >
              {project.title}
            </span>
          )}
          <span className={`text-xs ${urgencyColor}`}>
            {daysUntil === 0 ? 'Due today' : daysUntil === 1 ? 'Due tomorrow' : `${daysUntil} days left`}
          </span>
        </div>
      </div>
    </div>
  );
}

function UpcomingDeadlinesSection({ tasks, projects }: { tasks: Task[]; projects: Map<string, { title: string; color: string }> }) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const upcomingTasks = tasks
    .filter(t => t.dueDate && t.status !== 'completed')
    .map(t => {
      const dueDate = new Date(t.dueDate!);
      dueDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { task: t, daysUntil };
    })
    .filter(({ daysUntil }) => daysUntil >= 0 && daysUntil <= 7)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5);
  
  if (upcomingTasks.length === 0) {
    return null;
  }
  
  return (
    <Card variant="bordered" padding="none">
      <CardHeader className="px-4 pt-4">
        <CardTitle className="flex items-center gap-2">
          <span>⏰</span> Upcoming Deadlines
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-2">
          {upcomingTasks.map(({ task, daysUntil }) => (
            <DeadlineItem
              key={task.id}
              task={task}
              project={task.projectId ? projects.get(task.projectId) : undefined}
              daysUntil={daysUntil}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// HABITS CHECKLIST
// ============================================================================

interface HabitChecklistProps {
  habits: Array<{
    id: string;
    title: string;
    currentStreak: number;
    completed: boolean;
    color: string;
    scheduledTime?: string;
  }>;
  onToggle: (habitId: string) => void;
}

function HabitChecklist({ habits, onToggle }: HabitChecklistProps) {
  if (habits.length === 0) {
    return (
      <Card variant="bordered">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>🔁</span> Daily Habits
          </CardTitle>
          <a href="/habits" className="text-sm text-primary hover:underline">
            Create habits →
          </a>
        </CardHeader>
        <CardContent>
          <p className="text-text-muted text-center py-4">No habits set up yet</p>
        </CardContent>
      </Card>
    );
  }
  
  const completedCount = habits.filter(h => h.completed).length;
  
  return (
    <Card variant="bordered" padding="none">
      <CardHeader className="px-4 pt-4">
        <CardTitle className="flex items-center gap-2">
          <span>🔁</span> Daily Habits
          <Badge variant="secondary">{completedCount}/{habits.length}</Badge>
        </CardTitle>
        <a href="/habits" className="text-sm text-primary hover:underline">
          All habits →
        </a>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="divide-y divide-border">
          {habits.map(habit => (
            <div 
              key={habit.id}
              className="flex items-center gap-3 py-3 px-1"
            >
              <button
                onClick={() => onToggle(habit.id)}
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                  habit.completed
                    ? 'bg-success text-white scale-110'
                    : 'border-2 hover:border-success hover:bg-success/10'
                }`}
                style={{ borderColor: habit.completed ? undefined : habit.color }}
              >
                {habit.completed && (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              <div className="flex-1">
                <p className={`font-medium ${habit.completed ? 'text-text-muted line-through' : 'text-text'}`}>
                  {habit.title}
                </p>
                {habit.scheduledTime && (
                  <p className="text-xs text-text-muted">Scheduled: {habit.scheduledTime}</p>
                )}
              </div>
              {habit.currentStreak > 0 && (
                <Badge variant="success" size="sm">
                  🔥 {habit.currentStreak}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

export function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<Map<string, HabitLog>>(new Map());
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);
  const [userName, setUserName] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Modal states
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Auth check
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
            setUserName(firebaseUser.displayName?.split(' ')[0] || '');
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

  // Onboarding check
  useEffect(() => {
    if (!authChecked || !user) return;
    const checkOnboarding = async () => {
      try {
        const { getDb } = await import('@/lib/firebase');
        const { doc, getDoc } = await import('firebase/firestore');
        const db = getDb();
        const onboardingDoc = await getDoc(doc(db, 'users', user.uid, 'settings', 'onboarding'));
        if (!onboardingDoc.exists() || !onboardingDoc.data()?.completed) {
          setShowOnboarding(true);
        }
        setOnboardingChecked(true);
      } catch (err) {
        console.error('Onboarding check failed:', err);
        setOnboardingChecked(true);
      }
    };
    checkOnboarding();
  }, [authChecked, user]);

  // Load data
  useEffect(() => {
    if (!authChecked || !user) return;
    const unsubscribes: (() => void)[] = [];

    const loadData = async () => {
      try {
        const { subscribeToTasks } = await import('@/lib/db/tasks');
        const unsubTasks = subscribeToTasks((updatedTasks) => {
          setTasks(updatedTasks);
          setIsLoading(false);
        });
        unsubscribes.push(unsubTasks);

        const { subscribeToHabits } = await import('@/lib/db/habits');
        const unsubHabits = subscribeToHabits(user.uid, (updatedHabits) => {
          setHabits(updatedHabits);
        });
        unsubscribes.push(unsubHabits);

        const { getAllLogsForDate, getDateString } = await import('@/lib/db/habitLogs');
        const today = getDateString();
        const logs = await getAllLogsForDate(today);
        const logsMap = new Map<string, HabitLog>();
        logs.forEach(log => logsMap.set(log.habitId, log));
        setHabitLogs(logsMap);

        const { subscribeToProjects } = await import('@/lib/db/projects');
        const unsubProjects = subscribeToProjects(user.uid, (updatedProjects) => {
          setProjects(updatedProjects);
        });
        unsubscribes.push(unsubProjects);

        const { subscribeToGoals } = await import('@/lib/db/goals');
        const unsubGoals = subscribeToGoals(user.uid, (updatedGoals) => {
          setGoals(updatedGoals);
        });
        unsubscribes.push(unsubGoals);

        // Load milestones for task modal
        const { subscribeToAllMilestones } = await import('@/lib/db/milestones');
        const unsubMilestones = subscribeToAllMilestones(user.uid, (updatedMilestones) => {
          setMilestones(updatedMilestones);
        });
        unsubscribes.push(unsubMilestones);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setIsLoading(false);
      }
    };

    loadData();
    return () => unsubscribes.forEach(unsub => unsub());
  }, [authChecked, user]);

  // Toggle task completion
  const handleToggleTask = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;
      
      const { updateTask } = await import('@/lib/db/tasks');
      const isCompleted = task.status === 'completed';
      
      if (!isCompleted) {
        await updateTask(taskId, {
          status: 'completed',
          completedAt: new Date(),
        });
        setShowCelebration(true);
      } else {
        await updateTask(taskId, {
          status: 'pending',
          completedAt: undefined,
        });
      }
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  // Toggle habit completion
  const handleToggleHabit = async (habitId: string) => {
    if (!user) return;
    try {
      const { toggleHabitCompletion, getDateString, getAllLogsForDate } = await import('@/lib/db/habitLogs');
      const today = getDateString();
      await toggleHabitCompletion(habitId, today);
      
      const logs = await getAllLogsForDate(today);
      const logsMap = new Map<string, HabitLog>();
      logs.forEach(log => logsMap.set(log.habitId, log));
      setHabitLogs(logsMap);
    } catch (err) {
      console.error('Failed to toggle habit:', err);
    }
  };

  // Save handlers for modals
  const handleSaveTask = async (taskData: Partial<Task>) => {
    if (!user) return;
    try {
      const { createTask } = await import('@/lib/db/tasks');
      await createTask({
        title: taskData.title || 'Untitled Task',
        description: taskData.description,
        status: taskData.status || 'pending',
        priority: taskData.priority || 'medium',
        estimatedMinutes: taskData.estimatedMinutes || 30,
        estimatedSource: 'manual',
        projectId: taskData.projectId,
        milestoneId: taskData.milestoneId,
        dueDate: taskData.dueDate,
        tags: taskData.tags || [],
        blockedBy: [],
        blocking: [],
        reminders: [],
      });
      setShowTaskModal(false);
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const handleSaveHabit = async (habitData: Partial<Habit>) => {
    if (!user) return;
    try {
      const { createHabit } = await import('@/lib/db/habits');
      await createHabit({
        title: habitData.title || 'Untitled Habit',
        description: habitData.description,
        frequency: habitData.frequency || 'daily',
        daysOfWeek: habitData.daysOfWeek,
        reminderTime: habitData.reminderTime,
        scheduledTime: habitData.scheduledTime,
        estimatedMinutes: habitData.estimatedMinutes || 30,
        color: habitData.color || '#22c55e',
        icon: habitData.icon || '🎯',
        targetPerDay: habitData.targetPerDay,
        tags: habitData.tags || [],
        isArchived: false,
      });
      setShowHabitModal(false);
    } catch (err) {
      console.error('Failed to create habit:', err);
    }
  };

  const handleSaveNote = async (noteData: Omit<Note, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    if (!user) return;
    try {
      const { createNote } = await import('@/lib/db/notes');
      await createNote(noteData);
      setShowNoteModal(false);
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  };

  // Build project lookup
  const projectMap = useMemo(() => {
    const map = new Map<string, { title: string; color: string }>();
    projects.forEach(p => map.set(p.id, { title: p.title, color: p.color || '#6366f1' }));
    return map;
  }, [projects]);

  // Build today's scheduled items
  const todayScheduledItems = useMemo((): ScheduledItem[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const items: ScheduledItem[] = [];

    // Add scheduled tasks
    tasks.forEach(task => {
      if (!task.scheduledStart) return;
      const startDate = task.scheduledStart instanceof Date 
        ? task.scheduledStart 
        : (task.scheduledStart as any).toDate?.() || new Date(task.scheduledStart as any);
      
      if (startDate >= today && startDate < tomorrow) {
        const project = task.projectId ? projectMap.get(task.projectId) : undefined;
        const duration = task.estimatedMinutes || 30;
        const endDate = new Date(startDate.getTime() + duration * 60000);
        
        items.push({
          id: task.id,
          title: task.title,
          type: 'task',
          startTime: startDate,
          endTime: endDate,
          priority: task.priority,
          projectId: task.projectId,
          projectTitle: project?.title,
          projectColor: project?.color,
          dueDate: task.dueDate instanceof Date ? task.dueDate : undefined,
          estimatedMinutes: task.estimatedMinutes,
          completed: task.status === 'completed',
        });
      }
    });

    // Add scheduled habits
    const dayOfWeek = today.getDay();
    habits.forEach(habit => {
      if (habit.isArchived || !habit.scheduledTime) return;
      
      const isToday = 
        habit.frequency === 'daily' ||
        (habit.frequency === 'weekly' && habit.daysOfWeek?.includes(dayOfWeek)) ||
        (habit.frequency === 'custom' && habit.daysOfWeek?.includes(dayOfWeek));
      
      if (!isToday) return;
      
      const [hours, minutes] = habit.scheduledTime.split(':').map(Number);
      const startTime = new Date(today);
      startTime.setHours(hours, minutes, 0, 0);
      
      const duration = habit.estimatedMinutes || 30;
      const endTime = new Date(startTime.getTime() + duration * 60000);
      
      items.push({
        id: habit.id,
        title: habit.title,
        type: 'habit',
        startTime,
        endTime,
        color: habit.color,
        completed: habitLogs.get(habit.id)?.completed || false,
      });
    });

    return items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [tasks, habits, habitLogs, projectMap]);

  // Find current and next items
  const { currentItem, nextItem, timeUntilNext } = useMemo(() => {
    const now = currentTime;
    let current: ScheduledItem | null = null;
    let next: ScheduledItem | null = null;

    for (const item of todayScheduledItems) {
      if (item.completed) continue;
      
      if (item.startTime <= now && item.endTime > now) {
        current = item;
      } else if (item.startTime > now && !next) {
        next = item;
        break;
      }
    }

    let timeUntil = '';
    if (next) {
      const diff = next.startTime.getTime() - now.getTime();
      const minutes = Math.round(diff / 60000);
      if (minutes < 60) {
        timeUntil = `in ${minutes} min`;
      } else {
        const hours = Math.floor(minutes / 60);
        timeUntil = `in ${hours}h ${minutes % 60}m`;
      }
    }

    return { currentItem: current, nextItem: next, timeUntilNext: timeUntil };
  }, [todayScheduledItems, currentTime]);

  // Calculate stats
  const todayStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayTasks = tasks.filter(t => {
      if (t.scheduledStart) {
        const start = t.scheduledStart instanceof Date 
          ? t.scheduledStart 
          : (t.scheduledStart as any).toDate?.() || new Date(t.scheduledStart as any);
        const taskDate = new Date(start);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate.getTime() === today.getTime();
      }
      return false;
    });
    
    const completedTasks = todayTasks.filter(t => t.status === 'completed');
    const focusMinutes = completedTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
    
    const activeHabits = habits.filter(h => !h.isArchived);
    const completedHabits = activeHabits.filter(h => habitLogs.get(h.id)?.completed);
    
    return {
      tasksCompleted: completedTasks.length,
      tasksTotal: todayTasks.length,
      habitsCompleted: completedHabits.length,
      habitsTotal: activeHabits.length,
      focusMinutes,
    };
  }, [tasks, habits, habitLogs]);

  // Display habits
  const displayHabits = useMemo(() => {
    return habits
      .filter(h => !h.isArchived)
      .map(h => ({
        id: h.id,
        title: h.title,
        currentStreak: h.currentStreak,
        completed: habitLogs.get(h.id)?.completed || false,
        color: h.color,
        scheduledTime: h.scheduledTime,
      }));
  }, [habits, habitLogs]);

  // Greeting
  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Loading states
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

  if (showOnboarding && onboardingChecked) {
    return <OnboardingModal user={user} onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text">
            {greeting()}{userName ? `, ${userName}` : ''}! 👋
          </h1>
          <p className="text-text-secondary mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-mono font-bold text-text">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {/* Hero - Current/Next Focus */}
      <HeroSection
        currentItem={currentItem}
        nextItem={nextItem}
        onCompleteTask={handleToggleTask}
        timeUntilNext={timeUntilNext}
      />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <AgendaTimeline
            items={todayScheduledItems}
            onCompleteTask={handleToggleTask}
            projects={projectMap}
          />
          
          <UpcomingDeadlinesSection tasks={tasks} projects={projectMap} />
        </div>

        {/* Right Column - Stats & Actions */}
        <div className="space-y-6">
          <ProgressRingsSection {...todayStats} />
          <QuickActionsSection 
            onNewTask={() => setShowTaskModal(true)}
            onNewHabit={() => setShowHabitModal(true)}
            onNewNote={() => setShowNoteModal(true)}
          />
          <HabitChecklist habits={displayHabits} onToggle={handleToggleHabit} />
        </div>
      </div>

      {/* Completion Celebration */}
      <CompletionCelebration
        isActive={showCelebration}
        onComplete={() => setShowCelebration(false)}
      />

      {/* Quick Action Modals */}
      <TaskModal
        task={null}
        isOpen={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        onSave={handleSaveTask}
        projects={projects}
        milestones={milestones}
        mode="create"
      />

      <HabitModal
        habit={null}
        isOpen={showHabitModal}
        onClose={() => setShowHabitModal(false)}
        onSave={handleSaveHabit}
        mode="create"
      />

      <NoteModal
        isOpen={showNoteModal}
        onClose={() => setShowNoteModal(false)}
        onSave={handleSaveNote}
        tasks={tasks}
        projects={projects}
        goals={goals}
      />
    </div>
  );
}
