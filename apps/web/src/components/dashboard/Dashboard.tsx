import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Checkbox } from '@/components/ui';
import { CompletionCelebration } from '@/components/tasks';
import type { Task, Habit } from '@totalis/shared';

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

export function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);
  const [userName, setUserName] = useState('');

  // Load tasks and user
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const loadData = async () => {
      try {
        // Get user name
        const { getAuthInstance } = await import('@/lib/firebase');
        const auth = getAuthInstance();
        if (auth.currentUser) {
          setUserName(auth.currentUser.displayName?.split(' ')[0] || '');
        }

        // Subscribe to tasks
        const { subscribeToTasks } = await import('@/lib/db/tasks');
        unsubscribe = subscribeToTasks((updatedTasks) => {
          setTasks(updatedTasks);
          setIsLoading(false);
        });
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setIsLoading(false);
      }
    };

    loadData();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

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

  // Mock habits (will be real in Habits phase)
  const habits = [
    { id: '1', title: 'Morning meditation', currentStreak: 14, completed: true, color: '#6366f1' },
    { id: '2', title: 'Exercise', currentStreak: 7, completed: true, color: '#22c55e' },
    { id: '3', title: 'Read 30 minutes', currentStreak: 3, completed: false, color: '#f59e0b' },
    { id: '4', title: 'Journal', currentStreak: 21, completed: true, color: '#8b5cf6' },
  ];

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

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
          subtitle="Across all projects"
          isLoading={isLoading}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
        />
        <StatsCard
          title="Total Tasks"
          value={tasks.length}
          subtitle="In your workspace"
          isLoading={isLoading}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          }
        />
        <StatsCard
          title="Habits"
          value={`${habits.filter(h => h.completed).length}/${habits.length}`}
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
            <div className="divide-y divide-border">
              {habits.map((habit) => (
                <HabitItem key={habit.id} habit={habit} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

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
