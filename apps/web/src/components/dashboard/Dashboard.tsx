import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import type { Task, Habit } from '@totalis/shared';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
}

function StatsCard({ title, value, subtitle, icon, trend }: StatsCardProps) {
  return (
    <Card variant="bordered" className="animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary">{title}</p>
          <p className="text-2xl font-bold text-text mt-1">{value}</p>
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

interface TaskItemProps {
  task: {
    id: string;
    title: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    estimatedMinutes: number;
    projectName?: string;
  };
  onComplete?: () => void;
}

function TaskItem({ task, onComplete }: TaskItemProps) {
  const priorityColors = {
    low: 'bg-text-muted',
    medium: 'bg-primary',
    high: 'bg-warning',
    urgent: 'bg-danger',
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-hover transition-colors group">
      <button
        onClick={onComplete}
        className="w-5 h-5 rounded-full border-2 border-border hover:border-primary transition-colors flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-text font-medium truncate">{task.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`w-2 h-2 rounded-full ${priorityColors[task.priority]}`} />
          <span className="text-xs text-text-muted">{task.estimatedMinutes}m</span>
          {task.projectName && (
            <span className="text-xs text-text-muted">• {task.projectName}</span>
          )}
        </div>
      </div>
      <button className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-text transition-opacity">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </button>
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
  // Mock data - will be replaced with real data from hooks
  const stats = {
    tasksCompleted: 12,
    tasksTotal: 18,
    focusMinutes: 245,
    productivityScore: 85,
    habitsCompleted: 4,
    habitsTotal: 5,
  };

  const todayTasks = [
    { id: '1', title: 'Review project proposal', priority: 'high' as const, estimatedMinutes: 30, projectName: 'Client A' },
    { id: '2', title: 'Update documentation', priority: 'medium' as const, estimatedMinutes: 45 },
    { id: '3', title: 'Team standup meeting', priority: 'medium' as const, estimatedMinutes: 15 },
    { id: '4', title: 'Code review', priority: 'urgent' as const, estimatedMinutes: 60, projectName: 'Main App' },
  ];

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
          <h1 className="text-2xl font-bold text-text">{greeting()}! 👋</h1>
          <p className="text-text-secondary mt-1">
            You have {stats.tasksTotal - stats.tasksCompleted} tasks remaining today
          </p>
        </div>
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
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Tasks Completed"
          value={`${stats.tasksCompleted}/${stats.tasksTotal}`}
          subtitle={`${Math.round((stats.tasksCompleted / stats.tasksTotal) * 100)}% completion rate`}
          trend={{ value: 12, isPositive: true }}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
        />
        <StatsCard
          title="Focus Time"
          value={`${Math.floor(stats.focusMinutes / 60)}h ${stats.focusMinutes % 60}m`}
          subtitle="Total focused work today"
          trend={{ value: 8, isPositive: true }}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
        />
        <StatsCard
          title="Productivity Score"
          value={`${stats.productivityScore}%`}
          subtitle="Based on completion & focus"
          trend={{ value: 5, isPositive: true }}
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
          value={`${stats.habitsCompleted}/${stats.habitsTotal}`}
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
            <CardTitle>Today's Tasks</CardTitle>
            <a href="/tasks" className="text-sm text-primary hover:underline">
              View all
            </a>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="divide-y divide-border">
              {todayTasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </div>
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

      {/* AI Insights */}
      <Card variant="bordered" className="border-l-4 border-l-accent">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-accent/10 text-accent rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
              <path d="M12 2a10 10 0 0 1 10 10" />
              <path d="M12 12l8 4" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-text">AI Insight</h3>
            <p className="text-text-secondary mt-1">
              You're most productive between 9-11 AM. Consider scheduling your high-priority tasks during this window. 
              Your "Code review" task might take longer than estimated based on similar past tasks.
            </p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="secondary">Reschedule Tasks</Button>
              <Button size="sm" variant="ghost">Dismiss</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
