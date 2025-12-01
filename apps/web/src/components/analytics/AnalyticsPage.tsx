import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import type { Task, Habit, HabitLog, FocusSession, Project, Goal } from '@totalis/shared';
import type { User } from 'firebase/auth';

type TimeRange = '7d' | '30d' | '90d';

// Helper to safely convert Firestore Timestamp or date string to Date
function toSafeDate(value: unknown): Date | null {
  if (!value) return null;
  try {
    // Handle Firestore Timestamp
    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate();
    }
    // Handle date string or number
    const date = new Date(value as string | number);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

function toDateString(value: unknown): string | null {
  const date = toSafeDate(value);
  if (!date) return null;
  try {
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

interface DailyStats {
  date: string;
  tasksCompleted: number;
  tasksCreated: number;
  focusMinutes: number;
  habitsCompleted: number;
  totalHabits: number;
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  trend,
  icon 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  trend?: { value: number; isPositive: boolean };
  icon: React.ReactNode;
}) {
  return (
    <Card variant="bordered">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary">{title}</p>
          <p className="text-2xl font-bold text-text mt-1">{value}</p>
          {subtitle && <p className="text-xs text-text-muted mt-1">{subtitle}</p>}
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs ${trend.isPositive ? 'text-success' : 'text-danger'}`}>
              <span>{trend.isPositive ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value)}% vs previous period</span>
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

function SimpleBarChart({ 
  data, 
  dataKey, 
  color = 'var(--primary)',
  height = 120 
}: { 
  data: DailyStats[]; 
  dataKey: keyof DailyStats;
  color?: string;
  height?: number;
}) {
  const maxValue = Math.max(...data.map(d => Number(d[dataKey]) || 0), 1);
  
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((day, i) => {
        const value = Number(day[dataKey]) || 0;
        const barHeight = (value / maxValue) * 100;
        const isToday = day.date === new Date().toISOString().split('T')[0];
        
        return (
          <div
            key={day.date}
            className="flex-1 flex flex-col items-center gap-1 group relative"
          >
            <div 
              className="w-full rounded-t transition-all hover:opacity-80"
              style={{ 
                height: `${barHeight}%`,
                backgroundColor: isToday ? color : `${color}80`,
                minHeight: value > 0 ? '4px' : '0'
              }}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
              <div className="bg-surface border border-border rounded-lg px-2 py-1 text-xs whitespace-nowrap shadow-lg">
                <p className="font-medium">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                <p className="text-text-muted">{value} {dataKey === 'focusMinutes' ? 'min' : ''}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HabitStreakChart({ habits, habitLogs }: { habits: Habit[]; habitLogs: HabitLog[] }) {
  // Get last 7 days
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }

  return (
    <div className="space-y-3">
      {habits.slice(0, 5).map((habit) => {
        return (
          <div key={habit.id} className="flex items-center gap-3">
            <div className="w-24 truncate text-sm text-text">{habit.title}</div>
            <div className="flex-1 flex gap-1">
              {days.map((day) => {
                const log = habitLogs.find(l => l.habitId === habit.id && l.date === day);
                const completed = log?.completed ?? false;
                
                return (
                  <div
                    key={day}
                    className={`flex-1 h-6 rounded ${
                      completed ? 'bg-success' : 'bg-surface-hover'
                    }`}
                    title={`${new Date(day).toLocaleDateString('en-US', { weekday: 'short' })}: ${completed ? 'Completed' : 'Missed'}`}
                  />
                );
              })}
            </div>
            <Badge variant={habit.currentStreak > 0 ? 'success' : 'secondary'} className="w-16 justify-center">
              🔥 {habit.currentStreak}
            </Badge>
          </div>
        );
      })}
      {habits.length === 0 && (
        <p className="text-text-muted text-sm text-center py-4">No habits to track yet</p>
      )}
    </div>
  );
}

function ProjectProgressChart({ projects }: { projects: Project[] }) {
  const activeProjects = projects.filter(p => p.status !== 'completed' && p.status !== 'archived');
  
  return (
    <div className="space-y-4">
      {activeProjects.slice(0, 5).map((project) => {
        const progress = project.taskCount > 0 
          ? Math.round((project.completedTaskCount / project.taskCount) * 100)
          : 0;
        
        return (
          <div key={project.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-text truncate flex-1">{project.title}</span>
              <span className="text-xs text-text-muted ml-2">{progress}%</span>
            </div>
            <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-500"
                style={{ 
                  width: `${progress}%`,
                  backgroundColor: project.color || 'var(--primary)'
                }}
              />
            </div>
          </div>
        );
      })}
      {activeProjects.length === 0 && (
        <p className="text-text-muted text-sm text-center py-4">No active projects</p>
      )}
    </div>
  );
}

export function AnalyticsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [isLoading, setIsLoading] = useState(true);
  
  // Data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

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
          
          if (!firebaseUser) {
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

  // Load data
  useEffect(() => {
    if (!authChecked || !user) return;

    const unsubscribes: (() => void)[] = [];

    const loadData = async () => {
      try {
        const { subscribeToTasks } = await import('@/lib/db/tasks');
        const { subscribeToHabits } = await import('@/lib/db/habits');
        const { subscribeToHabitLogsForDate, getDateString } = await import('@/lib/db/habitLogs');
        const { subscribeToFocusSessions } = await import('@/lib/db/focusSessions');
        const { subscribeToProjects } = await import('@/lib/db/projects');
        const { subscribeToGoals } = await import('@/lib/db/goals');

        // Subscribe to tasks
        const unsubTasks = subscribeToTasks((updatedTasks) => {
          setTasks(updatedTasks);
          setIsLoading(false);
        });
        unsubscribes.push(unsubTasks);

        // Subscribe to habits
        const unsubHabits = subscribeToHabits(user.uid, (updatedHabits) => {
          setHabits(updatedHabits);
        });
        unsubscribes.push(unsubHabits);

        // Load habit logs for the time range
        const { getAllLogsForDate } = await import('@/lib/db/habitLogs');
        const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
        const allLogs: HabitLog[] = [];
        
        for (let i = 0; i < days; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          try {
            const logs = await getAllLogsForDate(dateStr);
            allLogs.push(...logs);
          } catch (e) {
            // Skip errors for individual days
          }
        }
        setHabitLogs(allLogs);

        // Subscribe to focus sessions
        const unsubFocus = subscribeToFocusSessions(user.uid, (updatedSessions) => {
          setFocusSessions(updatedSessions);
        });
        unsubscribes.push(unsubFocus);

        // Subscribe to projects
        const unsubProjects = subscribeToProjects(user.uid, (updatedProjects) => {
          setProjects(updatedProjects);
        });
        unsubscribes.push(unsubProjects);

        // Subscribe to goals
        const unsubGoals = subscribeToGoals(user.uid, (updatedGoals) => {
          setGoals(updatedGoals);
        });
        unsubscribes.push(unsubGoals);
      } catch (err) {
        console.error('Failed to load data:', err);
        setIsLoading(false);
      }
    };

    loadData();

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [authChecked, user, timeRange]);

  // Calculate daily stats
  const dailyStats = useMemo(() => {
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const stats: DailyStats[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dateStr = d.toISOString().split('T')[0];

      // Tasks completed on this day
      const tasksCompleted = tasks.filter(t => {
        if (!t.completedAt) return false;
        const completedDateStr = toDateString(t.completedAt);
        return completedDateStr === dateStr;
      }).length;

      // Tasks created on this day
      const tasksCreated = tasks.filter(t => {
        const createdDateStr = toDateString(t.createdAt);
        return createdDateStr === dateStr;
      }).length;

      // Focus minutes on this day
      const focusMinutes = focusSessions
        .filter(s => {
          const sessionDateStr = toDateString(s.startedAt);
          return sessionDateStr === dateStr && s.status === 'completed';
        })
        .reduce((sum, s) => sum + (s.actualDuration || 0), 0);

      // Habits completed on this day
      const dayLogs = habitLogs.filter(l => l.date === dateStr);
      const habitsCompleted = dayLogs.filter(l => l.completed).length;

      stats.push({
        date: dateStr,
        tasksCompleted,
        tasksCreated,
        focusMinutes,
        habitsCompleted,
        totalHabits: habits.length,
      });
    }

    return stats;
  }, [tasks, focusSessions, habitLogs, habits, timeRange]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalTasksCompleted = dailyStats.reduce((sum, d) => sum + d.tasksCompleted, 0);
    const totalFocusMinutes = dailyStats.reduce((sum, d) => sum + d.focusMinutes, 0);
    const totalHabitsCompleted = dailyStats.reduce((sum, d) => sum + d.habitsCompleted, 0);
    const totalHabitsPossible = dailyStats.reduce((sum, d) => sum + d.totalHabits, 0);
    
    const avgTasksPerDay = dailyStats.length > 0 
      ? (totalTasksCompleted / dailyStats.length).toFixed(1)
      : '0';
    
    const avgFocusPerDay = dailyStats.length > 0
      ? Math.round(totalFocusMinutes / dailyStats.length)
      : 0;

    const habitCompletionRate = totalHabitsPossible > 0
      ? Math.round((totalHabitsCompleted / totalHabitsPossible) * 100)
      : 0;

    // Best streak
    const bestStreak = habits.reduce((max, h) => Math.max(max, h.longestStreak), 0);

    // Active goals
    const activeGoals = goals.filter(g => g.status === 'active').length;
    const completedGoals = goals.filter(g => g.status === 'completed').length;

    return {
      totalTasksCompleted,
      totalFocusMinutes,
      avgTasksPerDay,
      avgFocusPerDay,
      habitCompletionRate,
      bestStreak,
      activeGoals,
      completedGoals,
    };
  }, [dailyStats, habits, goals]);

  // Show loading
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Analytics</h1>
          <p className="text-text-secondary mt-1">Track your productivity trends</p>
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as TimeRange[]).map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setTimeRange(range)}
            >
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Tasks Completed"
          value={summaryStats.totalTasksCompleted}
          subtitle={`${summaryStats.avgTasksPerDay} avg/day`}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
        />
        <StatCard
          title="Focus Time"
          value={`${Math.floor(summaryStats.totalFocusMinutes / 60)}h ${summaryStats.totalFocusMinutes % 60}m`}
          subtitle={`${summaryStats.avgFocusPerDay} min avg/day`}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          }
        />
        <StatCard
          title="Habit Completion"
          value={`${summaryStats.habitCompletionRate}%`}
          subtitle={`Best streak: ${summaryStats.bestStreak} days`}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20v-6M6 20V10M18 20V4" />
            </svg>
          }
        />
        <StatCard
          title="Goals"
          value={summaryStats.activeGoals}
          subtitle={`${summaryStats.completedGoals} completed`}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          }
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks Completed Chart */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Tasks Completed</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-32 flex items-center justify-center">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <>
                <SimpleBarChart data={dailyStats} dataKey="tasksCompleted" />
                <div className="flex justify-between mt-2 text-xs text-text-muted">
                  <span>{new Date(dailyStats[0]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span>Today</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Focus Time Chart */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Focus Time</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-32 flex items-center justify-center">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <>
                <SimpleBarChart data={dailyStats} dataKey="focusMinutes" color="var(--accent)" />
                <div className="flex justify-between mt-2 text-xs text-text-muted">
                  <span>{new Date(dailyStats[0]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span>Today</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Habits & Projects Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Habit Streaks */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Habit Streaks (Last 7 Days)</CardTitle>
            <a href="/habits" className="text-sm text-primary hover:underline">View all</a>
          </CardHeader>
          <CardContent>
            <HabitStreakChart habits={habits} habitLogs={habitLogs} />
          </CardContent>
        </Card>

        {/* Project Progress */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Project Progress</CardTitle>
            <a href="/projects" className="text-sm text-primary hover:underline">View all</a>
          </CardHeader>
          <CardContent>
            <ProjectProgressChart projects={projects} />
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      <Card variant="bordered" className="border-l-4 border-l-accent">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-accent/10 text-accent rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-text">Productivity Insight</h3>
            <p className="text-text-secondary mt-1">
              {summaryStats.totalTasksCompleted > 0 
                ? summaryStats.habitCompletionRate >= 80
                  ? `Great job! You're maintaining ${summaryStats.habitCompletionRate}% habit completion and completed ${summaryStats.totalTasksCompleted} tasks. Keep up the momentum!`
                  : summaryStats.habitCompletionRate >= 50
                    ? `You've completed ${summaryStats.totalTasksCompleted} tasks. Try to improve your habit completion rate from ${summaryStats.habitCompletionRate}% - consistency is key!`
                    : `You've completed ${summaryStats.totalTasksCompleted} tasks. Focus on building consistent habits - even small daily wins compound over time.`
                : 'Start tracking your tasks and habits to see productivity insights here!'
              }
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
