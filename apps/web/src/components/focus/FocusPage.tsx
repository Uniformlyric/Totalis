import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@/components/ui';
import { FocusTimer } from './FocusTimer';
import type { Task, FocusSession } from '@totalis/shared';
import type { User } from 'firebase/auth';

export function FocusPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        const { subscribeToTodaysFocusSessions } = await import('@/lib/db/focusSessions');

        const unsubTasks = subscribeToTasks((updatedTasks) => {
          // Only show incomplete tasks
          setTasks(updatedTasks.filter(t => t.status !== 'completed'));
          setIsLoading(false);
        });
        unsubscribes.push(unsubTasks);

        const unsubSessions = subscribeToTodaysFocusSessions(user.uid, (updatedSessions) => {
          setSessions(updatedSessions);
        });
        unsubscribes.push(unsubSessions);
      } catch (err) {
        console.error('Failed to load data:', err);
        setIsLoading(false);
      }
    };

    loadData();

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [authChecked, user]);

  // Calculate today's stats
  const completedSessions = sessions.filter(s => s.status === 'completed').length;
  const totalFocusMinutes = sessions
    .filter(s => s.status === 'completed')
    .reduce((total, s) => total + s.actualDuration, 0);

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
        <h1 className="text-2xl font-bold text-text">Focus Mode</h1>
        <p className="text-text-secondary mt-1">
          Deep work with the Pomodoro Technique
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timer */}
        <div className="lg:col-span-2">
          <FocusTimer task={selectedTask} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Today's Stats */}
          <Card variant="bordered">
            <CardHeader>
              <CardTitle>Today's Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Focus Sessions</span>
                <span className="text-xl font-bold text-text">{completedSessions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Total Focus Time</span>
                <span className="text-xl font-bold text-primary">
                  {Math.floor(totalFocusMinutes / 60)}h {totalFocusMinutes % 60}m
                </span>
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-sm text-text-muted">
                  {completedSessions >= 4 
                    ? '🎉 Great job! You\'ve completed a full focus cycle!'
                    : `${4 - (completedSessions % 4)} more sessions until a long break`
                  }
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Task Selection */}
          <Card variant="bordered">
            <CardHeader>
              <CardTitle>Select Task</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse h-10 bg-border rounded" />
                  ))}
                </div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-text-muted text-sm">No pending tasks</p>
                  <a href="/tasks" className="text-primary text-sm hover:underline mt-1 inline-block">
                    Create a task
                  </a>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {/* No task option */}
                  <button
                    onClick={() => setSelectedTask(null)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      !selectedTask
                        ? 'bg-primary/10 border border-primary text-primary'
                        : 'bg-surface-hover hover:bg-surface text-text-secondary'
                    }`}
                  >
                    <span className="font-medium">Free Focus</span>
                    <p className="text-xs opacity-75 mt-0.5">Focus without a specific task</p>
                  </button>
                  
                  {tasks.slice(0, 10).map((task) => (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedTask?.id === task.id
                          ? 'bg-primary/10 border border-primary text-primary'
                          : 'bg-surface-hover hover:bg-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          task.priority === 'urgent' ? 'bg-danger' :
                          task.priority === 'high' ? 'bg-warning' :
                          task.priority === 'medium' ? 'bg-primary' : 'bg-text-muted'
                        }`} />
                        <span className="font-medium text-text truncate">{task.title}</span>
                      </div>
                      {task.estimatedMinutes && (
                        <p className="text-xs text-text-muted mt-1 ml-4">
                          Est. {task.estimatedMinutes} min
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Sessions */}
          {sessions.length > 0 && (
            <Card variant="bordered">
              <CardHeader>
                <CardTitle>Recent Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sessions.slice(0, 5).map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-surface-hover"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          session.status === 'completed' ? 'bg-success' :
                          session.status === 'interrupted' ? 'bg-warning' : 'bg-primary'
                        }`} />
                        <span className="text-sm text-text">
                          {new Date(session.startedAt).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <Badge
                        variant={
                          session.status === 'completed' ? 'success' :
                          session.status === 'interrupted' ? 'warning' : 'primary'
                        }
                      >
                        {session.actualDuration}m
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Tips */}
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
            <h3 className="font-semibold text-text">Pomodoro Technique</h3>
            <p className="text-text-secondary mt-1">
              Work in focused 25-minute sessions, then take a 5-minute break. 
              After 4 sessions, take a longer 15-minute break. This rhythm helps maintain 
              concentration and prevents burnout.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
