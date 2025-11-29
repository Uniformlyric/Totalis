import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Checkbox } from '@/components/ui';
import { CompletionCelebration } from '@/components/tasks';
import type { Task, Habit, HabitLog, Project, Goal } from '@totalis/shared';
import type { User } from 'firebase/auth';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  isLoading?: boolean;
}

function StatsCard({ title, value, subtitle, icon, trend, isLoading }: StatsCardProps) {
  return (
    <Card variant="bordered" className="animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary">{title}</p>
          {isLoading ? (
            <div className="h-8 w-16 bg-border animate-pulse rounded mt-1" />
          ) : (
            <p className="text-2xl font-bold text-text mt-1">{value}</p>
          )}
          {subtitle && (
            <p className="text-xs text-text-muted mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs ${trend.isPositive ? 'text-success' : 'text-danger'}`}>
              <span>{trend.isPositive ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value)}% vs last week</span>
            </div>
          )}
        </div>
        <div className="p-3 bg-primary/10 text-primary rounded-xl">
          {icon}
        </div>
      </div>
    </Card>
  );
}

interface DashboardTaskItemProps {
  task: Task;
  onComplete: (taskId: string, completed: boolean) => void;
}

function DashboardTaskItem({ task, onComplete }: DashboardTaskItemProps) {
  const priorityColors = {
    low: 'bg-text-muted',
    medium: 'bg-primary',
    high: 'bg-warning',
    urgent: 'bg-danger',
  };

  const isCompleted = task.status === 'completed';

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-hover transition-colors group">
      <Checkbox
        checked={isCompleted}
        onChange={(checked) => onComplete(task.id, checked)}
      />
      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${isCompleted ? 'text-text-muted line-through' : 'text-text'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`w-2 h-2 rounded-full ${priorityColors[task.priority]}`} />
          <span className="text-xs text-text-muted">{task.estimatedMinutes}m</span>
          {task.dueDate && (
            <span className="text-xs text-text-muted">
              • Due {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
      <a
        href="/tasks"
        className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-text transition-opacity"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </a>
    </div>
  );
}

interface HabitItemProps {
  habit: {
    id: string;
    title: string;
    currentStreak: number;
    completed: boolean;
    color: string;
  };
  onToggle?: () => void;
}

function HabitItem({ habit, onToggle }: HabitItemProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-hover transition-colors">
      <button
        onClick={onToggle}
        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
          habit.completed
            ? 'bg-success text-white'
            : 'border-2 border-border hover:border-success'
        }`}
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
      </div>
      <Badge variant={habit.currentStreak > 0 ? 'success' : 'default'}>
        🔥 {habit.currentStreak}
      </Badge>
    </div>
  );
}

interface DashboardHabit {
  id: string;
  title: string;
  currentStreak: number;
  completed: boolean;
  color: string;
}

export function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<Map<string, HabitLog>>(new Map());
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);
  const [userName, setUserName] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Check authentication first
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
            // Redirect to login if not authenticated
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

  // Load all data after auth is confirmed
  useEffect(() => {
    if (!authChecked || !user) return;

    const unsubscribes: (() => void)[] = [];

    const loadData = async () => {
      try {
        // Subscribe to tasks
        const { subscribeToTasks } = await import('@/lib/db/tasks');
        const unsubTasks = subscribeToTasks((updatedTasks) => {
          setTasks(updatedTasks);
          setIsLoading(false);
        });
        unsubscribes.push(unsubTasks);

        // Subscribe to habits
        const { subscribeToHabits } = await import('@/lib/db/habits');
        const unsubHabits = subscribeToHabits(user.uid, (updatedHabits) => {
          setHabits(updatedHabits);
        });
        unsubscribes.push(unsubHabits);

        // Load today's habit logs
        const { getAllLogsForDate, getDateString } = await import('@/lib/db/habitLogs');
        const today = getDateString();
        const logs = await getAllLogsForDate(today);
        const logsMap = new Map<string, HabitLog>();
        logs.forEach(log => logsMap.set(log.habitId, log));
        setHabitLogs(logsMap);

        // Subscribe to projects
        const { subscribeToProjects } = await import('@/lib/db/projects');
        const unsubProjects = subscribeToProjects(user.uid, (updatedProjects) => {
          setProjects(updatedProjects);
        });
        unsubscribes.push(unsubProjects);

        // Subscribe to goals
        const { subscribeToGoals } = await import('@/lib/db/goals');
        const unsubGoals = subscribeToGoals(user.uid, (updatedGoals) => {
          setGoals(updatedGoals);
        });
        unsubscribes.push(unsubGoals);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setIsLoading(false);
      }
    };

    loadData();

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [authChecked, user]);

  // Toggle task completion
  const handleToggleTask = async (taskId: string, completed: boolean) => {
    try {
      const { updateTask } = await import('@/lib/db/tasks');
      
      if (completed) {
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
      const { toggleHabitCompletion, getDateString } = await import('@/lib/db/habitLogs');
      const today = getDateString();
      
      await toggleHabitCompletion(habitId, today);
      
      // Refresh today's logs
      const { getAllLogsForDate } = await import('@/lib/db/habitLogs');
      const logs = await getAllLogsForDate(today);
      const logsMap = new Map<string, HabitLog>();
      logs.forEach(log => logsMap.set(log.habitId, log));
      setHabitLogs(logsMap);
    } catch (err) {
      console.error('Failed to toggle habit:', err);
    }
  };

  // Calculate stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayTasks = tasks.filter(t => {
    if (t.dueDate) {
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due.getTime() === today.getTime();
    }
    // Also show pending tasks with no due date
    return t.status !== 'completed';
  }).slice(0, 5);

  const completedToday = tasks.filter(t => {
    if (!t.completedAt) return false;
    const completed = new Date(t.completedAt);
    completed.setHours(0, 0, 0, 0);
    return completed.getTime() === today.getTime();
  }).length;

  const totalToday = tasks.filter(t => {
    if (t.dueDate) {
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due.getTime() === today.getTime();
    }
    return false;
  }).length || 1;

  const pendingTasks = tasks.filter(t => t.status !== 'completed').length;
  const completionRate = Math.round((completedToday / Math.max(totalToday, 1)) * 100);

  // Transform habits to display format with completion status from habitLogs
  const displayHabits: DashboardHabit[] = habits.map(habit => ({
    id: habit.id,
    title: habit.title,
    currentStreak: habit.currentStreak,
    completed: habitLogs.get(habit.id)?.completed ?? false,
    color: habit.color,
  }));

  // Calculate completed habits count
  const completedHabitsCount = displayHabits.filter(h => h.completed).length;

  // Calculate active goals (not completed)
  const activeGoals = goals.filter(g => g.status !== 'completed');

  // Calculate active projects
  const activeProjects = projects.filter(p => p.status !== 'completed');

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Redirect happens in useEffect, show loading while redirecting
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">
            {greeting()}{userName ? `, ${userName}` : ''}! 👋
          </h1>
          <p className="text-text-secondary mt-1">
            {pendingTasks === 0 
              ? "You're all caught up! Time to relax or add new tasks."
              : `You have ${pendingTasks} task${pendingTasks === 1 ? '' : 's'} to complete`
            }
          </p>
        </div>
        <a href="/tasks">
          <Button
            leftIcon={
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            }
          >
            Add Task
          </Button>
        </a>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Tasks Completed"
          value={`${completedToday}/${totalToday}`}
          subtitle={`${completionRate}% completion rate`}
          isLoading={isLoading}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
        />
        <StatsCard
          title="Pending Tasks"
          value={pendingTasks}
          subtitle={`${activeProjects.length} active project${activeProjects.length !== 1 ? 's' : ''}`}
          isLoading={isLoading}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
        />
        <StatsCard
          title="Active Goals"
          value={activeGoals.length}
          subtitle={goals.filter(g => g.status === 'completed').length > 0 ? `${goals.filter(g => g.status === 'completed').length} completed` : 'Set ambitious goals!'}
          isLoading={isLoading}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          }
        />
        <StatsCard
          title="Habits"
          value={`${completedHabitsCount}/${displayHabits.length}`}
          subtitle="Keep the streak going!"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20v-6M6 20V10M18 20V4" />
            </svg>
          }
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Tasks */}
        <Card variant="bordered" padding="none" className="lg:col-span-2">
          <CardHeader className="px-4 pt-4">
            <CardTitle>Your Tasks</CardTitle>
            <a href="/tasks" className="text-sm text-primary hover:underline">
              View all
            </a>
          </CardHeader>
          <CardContent className="pb-2">
            {isLoading ? (
              <div className="space-y-3 p-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-border" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-border rounded w-3/4" />
                      <div className="h-3 bg-border rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : todayTasks.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-surface-hover flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
                <p className="text-text-muted">No tasks yet</p>
                <a href="/tasks" className="text-sm text-primary hover:underline mt-2 inline-block">
                  Create your first task
                </a>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {todayTasks.map((task) => (
                  <DashboardTaskItem
                    key={task.id}
                    task={task}
                    onComplete={handleToggleTask}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Habits */}
        <Card variant="bordered" padding="none">
          <CardHeader className="px-4 pt-4">
            <CardTitle>Daily Habits</CardTitle>
            <a href="/habits" className="text-sm text-primary hover:underline">
              View all
            </a>
          </CardHeader>
          <CardContent className="pb-2">
            {displayHabits.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-surface-hover flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                    <path d="M12 20v-6M6 20V10M18 20V4" />
                  </svg>
                </div>
                <p className="text-text-muted">No habits yet</p>
                <a href="/habits" className="text-sm text-primary hover:underline mt-2 inline-block">
                  Create your first habit
                </a>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {displayHabits.map((habit) => (
                  <HabitItem 
                    key={habit.id} 
                    habit={habit} 
                    onToggle={() => handleToggleHabit(habit.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Goals & Projects Section */}
      {(activeGoals.length > 0 || activeProjects.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Goals */}
          <Card variant="bordered" padding="none">
            <CardHeader className="px-4 pt-4">
              <CardTitle>Active Goals</CardTitle>
              <a href="/goals" className="text-sm text-primary hover:underline">
                View all
              </a>
            </CardHeader>
            <CardContent className="pb-2">
              {activeGoals.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-text-muted text-sm">No active goals</p>
                  <a href="/goals" className="text-sm text-primary hover:underline mt-1 inline-block">
                    Create a goal
                  </a>
                </div>
              ) : (
                <div className="space-y-3 p-2">
                  {activeGoals.slice(0, 3).map((goal) => {
                    // Calculate progress from linked projects
                    const linkedProjects = projects.filter(p => p.goalId === goal.id);
                    const progress = linkedProjects.length > 0 
                      ? Math.round(linkedProjects.reduce((acc, p) => acc + (p.progress || 0), 0) / linkedProjects.length)
                      : goal.progress;
                    return (
                      <a
                        key={goal.id}
                        href={`/goals?id=${goal.id}`}
                        className="block p-3 rounded-lg hover:bg-surface-hover transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: goal.color }}
                          />
                          <span className="font-medium text-text flex-1 truncate">{goal.title}</span>
                          <Badge variant="secondary">{progress}%</Badge>
                        </div>
                        <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500"
                            style={{ 
                              width: `${progress}%`,
                              backgroundColor: goal.color 
                            }}
                          />
                        </div>
                        {goal.deadline && (
                          <p className="text-xs text-text-muted mt-2">
                            Target: {new Date(goal.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                      </a>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Projects */}
          <Card variant="bordered" padding="none">
            <CardHeader className="px-4 pt-4">
              <CardTitle>Active Projects</CardTitle>
              <a href="/projects" className="text-sm text-primary hover:underline">
                View all
              </a>
            </CardHeader>
            <CardContent className="pb-2">
              {activeProjects.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-text-muted text-sm">No active projects</p>
                  <a href="/projects" className="text-sm text-primary hover:underline mt-1 inline-block">
                    Create a project
                  </a>
                </div>
              ) : (
                <div className="space-y-3 p-2">
                  {activeProjects.slice(0, 3).map((project) => {
                    const progress = project.taskCount 
                      ? Math.round((project.completedTaskCount / project.taskCount) * 100) 
                      : 0;
                    return (
                      <a
                        key={project.id}
                        href={`/projects?id=${project.id}`}
                        className="block p-3 rounded-lg hover:bg-surface-hover transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: project.color }}
                          />
                          <span className="font-medium text-text flex-1 truncate">{project.title}</span>
                          <span className="text-xs text-text-muted">
                            {project.completedTaskCount || 0}/{project.taskCount || 0} tasks
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500"
                            style={{ 
                              width: `${progress}%`,
                              backgroundColor: project.color 
                            }}
                          />
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Tip */}
      <Card variant="bordered" className="border-l-4 border-l-accent">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-accent/10 text-accent rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-text">Quick Tip</h3>
            <p className="text-text-secondary mt-1">
              Press <kbd className="px-1.5 py-0.5 bg-surface-hover rounded text-xs font-mono">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-surface-hover rounded text-xs font-mono">K</kbd> to quickly search and navigate. 
              Try adding tasks with priorities to help focus on what matters most!
            </p>
          </div>
        </div>
      </Card>

      {/* Completion Celebration */}
      <CompletionCelebration
        isActive={showCelebration}
        onComplete={() => setShowCelebration(false)}
      />
    </div>
  );
}
