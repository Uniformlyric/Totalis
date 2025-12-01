import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import type { Task, Project, Goal } from '@totalis/shared';
import type { User } from 'firebase/auth';

type ViewMode = 'week' | 'month' | 'quarter';

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

interface TimelineItem {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  color: string;
  type: 'project' | 'task' | 'goal';
  status: string;
  projectId?: string;
  progress?: number;
}

interface DayColumn {
  date: Date;
  dateStr: string;
  isToday: boolean;
  isWeekend: boolean;
  dayOfMonth: number;
  dayName: string;
  monthName: string;
}

function generateDayColumns(startDate: Date, days: number): DayColumn[] {
  const columns: DayColumn[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();

    columns.push({
      date,
      dateStr,
      isToday: dateStr === today,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      dayOfMonth: date.getDate(),
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      monthName: date.toLocaleDateString('en-US', { month: 'short' }),
    });
  }

  return columns;
}

function TimelineBar({ 
  item, 
  dayColumns, 
  onClick 
}: { 
  item: TimelineItem; 
  dayColumns: DayColumn[];
  onClick?: () => void;
}) {
  const startIdx = dayColumns.findIndex(d => d.dateStr >= item.startDate.toISOString().split('T')[0]);
  const endIdx = dayColumns.findIndex(d => d.dateStr > item.endDate.toISOString().split('T')[0]);
  
  // If start is before visible range, start at 0
  const actualStart = startIdx === -1 ? 0 : startIdx;
  // If end is after visible range, end at last column
  const actualEnd = endIdx === -1 ? dayColumns.length : endIdx;
  
  const span = actualEnd - actualStart;
  
  if (span <= 0) return null;

  const leftPercent = (actualStart / dayColumns.length) * 100;
  const widthPercent = (span / dayColumns.length) * 100;

  return (
    <div
      className="absolute h-7 rounded-md flex items-center px-2 cursor-pointer transition-all hover:brightness-110 hover:shadow-lg overflow-hidden group"
      style={{
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        backgroundColor: item.color,
        top: '4px',
      }}
      onClick={onClick}
      title={`${item.title}\n${item.startDate.toLocaleDateString()} - ${item.endDate.toLocaleDateString()}`}
    >
      <span className="text-xs font-medium text-white truncate drop-shadow-sm">
        {item.title}
      </span>
      {/* Progress indicator */}
      {item.progress !== undefined && item.progress > 0 && (
        <div 
          className="absolute bottom-0 left-0 h-1 bg-white/30 rounded-b"
          style={{ width: `${item.progress}%` }}
        />
      )}
    </div>
  );
}

function MilestoneMarker({
  date,
  title,
  dayColumns,
}: {
  date: Date;
  title: string;
  dayColumns: DayColumn[];
}) {
  const dateStr = date.toISOString().split('T')[0];
  const idx = dayColumns.findIndex(d => d.dateStr === dateStr);
  
  if (idx === -1) return null;

  const leftPercent = ((idx + 0.5) / dayColumns.length) * 100;

  return (
    <div
      className="absolute flex flex-col items-center"
      style={{ left: `${leftPercent}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
    >
      <div 
        className="w-4 h-4 bg-warning rotate-45 border-2 border-warning-dark"
        title={title}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-text mb-2">No Timeline Items</h3>
      <p className="text-text-muted max-w-md">
        Add tasks with due dates or create projects to see them on the timeline.
        Items with start and end dates will appear as bars on the Gantt chart.
      </p>
    </div>
  );
}

export function TimelinePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7); // Start a week before today
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null);

  // Data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Days to show based on view mode
  const daysToShow = useMemo(() => {
    switch (viewMode) {
      case 'week': return 14;
      case 'month': return 35;
      case 'quarter': return 90;
    }
  }, [viewMode]);

  // Generate day columns
  const dayColumns = useMemo(() => {
    return generateDayColumns(startDate, daysToShow);
  }, [startDate, daysToShow]);

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
        const { subscribeToProjects } = await import('@/lib/db/projects');
        const { subscribeToGoals } = await import('@/lib/db/goals');

        // Subscribe to tasks
        const unsubTasks = subscribeToTasks((updatedTasks) => {
          setTasks(updatedTasks);
          setIsLoading(false);
        });
        unsubscribes.push(unsubTasks);

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
  }, [authChecked, user]);

  // Scroll to today on load
  useEffect(() => {
    if (!isLoading && scrollRef.current) {
      const todayIdx = dayColumns.findIndex(d => d.isToday);
      if (todayIdx !== -1) {
        const scrollPos = (todayIdx / dayColumns.length) * scrollRef.current.scrollWidth;
        scrollRef.current.scrollLeft = Math.max(0, scrollPos - 200);
      }
    }
  }, [isLoading, dayColumns]);

  // Convert data to timeline items
  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = [];
    const projectColors: Record<string, string> = {};

    // Add projects as a color map
    projects.forEach((project) => {
      projectColors[project.id] = project.color || '#6366f1';
      
      // Add projects with deadlines as timeline items
      if (project.deadline) {
        const endD = toSafeDate(project.deadline);
        if (!endD) return; // Skip if invalid date
        
        const startD = toSafeDate(project.createdAt) || new Date();
        
        // Calculate progress
        const progress = project.taskCount > 0
          ? Math.round((project.completedTaskCount / project.taskCount) * 100)
          : 0;

        items.push({
          id: project.id,
          title: project.title,
          startDate: startD,
          endDate: endD,
          color: project.color || '#6366f1',
          type: 'project',
          status: project.status,
          progress,
        });
      }
    });

    // Add tasks with due dates
    tasks
      .filter(t => t.dueDate && t.status !== 'completed')
      .forEach((task) => {
        const dueDate = toSafeDate(task.dueDate);
        if (!dueDate) return; // Skip if invalid date
        
        // Task spans from creation to due date, or just 1 day if no creation date
        const startD = toSafeDate(task.createdAt) || new Date(dueDate);
        startD.setHours(0, 0, 0, 0);
        
        // If task is short, show it as at least 1 day
        const daysDiff = Math.max(1, Math.ceil((dueDate.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)));
        
        // For long-running tasks, show full span. For quick tasks, just show near due date
        const effectiveStart = daysDiff > 7 ? startD : new Date(dueDate.getTime() - 3 * 24 * 60 * 60 * 1000);

        items.push({
          id: task.id,
          title: task.title,
          startDate: effectiveStart,
          endDate: dueDate,
          color: task.projectId && projectColors[task.projectId] 
            ? projectColors[task.projectId] 
            : '#64748b',
          type: 'task',
          status: task.status,
          projectId: task.projectId,
        });
      });

    // Add goals with deadlines
    goals
      .filter(g => g.deadline && g.status !== 'completed')
      .forEach((goal) => {
        const deadline = toSafeDate(goal.deadline);
        if (!deadline) return; // Skip if invalid date
        
        const startD = toSafeDate(goal.createdAt) || new Date();
        
        items.push({
          id: goal.id,
          title: goal.title,
          startDate: startD,
          endDate: deadline,
          color: '#10b981', // Green for goals
          type: 'goal',
          status: goal.status,
          progress: goal.progress,
        });
      });

    // Sort by start date
    return items.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [tasks, projects, goals]);

  // Group items by type for display
  const groupedItems = useMemo(() => {
    return {
      projects: timelineItems.filter(i => i.type === 'project'),
      goals: timelineItems.filter(i => i.type === 'goal'),
      tasks: timelineItems.filter(i => i.type === 'task'),
    };
  }, [timelineItems]);

  // Navigate timeline
  const navigateTimeline = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      const newDate = new Date();
      newDate.setDate(newDate.getDate() - 7);
      newDate.setHours(0, 0, 0, 0);
      setStartDate(newDate);
    } else {
      const days = viewMode === 'week' ? 7 : viewMode === 'month' ? 14 : 30;
      const newDate = new Date(startDate);
      newDate.setDate(newDate.getDate() + (direction === 'next' ? days : -days));
      setStartDate(newDate);
    }
  };

  // Render loading state
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

  const hasItems = timelineItems.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Timeline</h1>
          <p className="text-text-secondary mt-1">
            {dayColumns[0]?.monthName} {dayColumns[0]?.date.getFullYear()} — {dayColumns[dayColumns.length - 1]?.monthName} {dayColumns[dayColumns.length - 1]?.date.getFullYear()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Navigation */}
          <div className="flex gap-1">
            <Button variant="secondary" size="sm" onClick={() => navigateTimeline('prev')}>
              ←
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigateTimeline('today')}>
              Today
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigateTimeline('next')}>
              →
            </Button>
          </div>
          {/* View mode */}
          <div className="flex gap-1">
            {(['week', 'month', 'quarter'] as ViewMode[]).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setViewMode(mode)}
              >
                {mode === 'week' ? '2 Weeks' : mode === 'month' ? 'Month' : 'Quarter'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-primary" />
          <span className="text-text-muted">Projects</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-success" />
          <span className="text-text-muted">Goals</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-gray-500" />
          <span className="text-text-muted">Tasks</span>
        </div>
      </div>

      {isLoading ? (
        <Card variant="bordered">
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </Card>
      ) : !hasItems ? (
        <Card variant="bordered">
          <EmptyState />
        </Card>
      ) : (
        <Card variant="bordered" className="overflow-hidden">
          <div ref={scrollRef} className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Timeline Header */}
              <div className="flex border-b border-border sticky top-0 bg-surface z-10">
                <div className="w-32 flex-shrink-0 p-2 text-xs font-medium text-text-muted border-r border-border">
                  Item
                </div>
                <div className="flex-1 flex">
                  {dayColumns.map((day) => (
                    <div
                      key={day.dateStr}
                      className={`flex-1 text-center p-1 text-xs border-r border-border last:border-r-0 ${
                        day.isToday 
                          ? 'bg-primary/10 font-bold text-primary' 
                          : day.isWeekend 
                            ? 'bg-surface-hover text-text-muted' 
                            : 'text-text-muted'
                      }`}
                    >
                      <div>{day.dayName}</div>
                      <div className="font-medium">{day.dayOfMonth}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Projects Section */}
              {groupedItems.projects.length > 0 && (
                <>
                  <div className="flex bg-surface-hover/50 border-b border-border">
                    <div className="w-32 flex-shrink-0 p-2 text-xs font-semibold text-text flex items-center gap-2 border-r border-border">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3h18v18H3zM3 9h18M9 21V9"/>
                      </svg>
                      Projects
                    </div>
                    <div className="flex-1" />
                  </div>
                  {groupedItems.projects.map((item) => (
                    <div key={item.id} className="flex border-b border-border hover:bg-surface-hover/30">
                      <div className="w-32 flex-shrink-0 p-2 text-xs truncate border-r border-border text-text">
                        {item.title}
                      </div>
                      <div className="flex-1 relative h-9">
                        {/* Grid lines */}
                        <div className="absolute inset-0 flex">
                          {dayColumns.map((day) => (
                            <div
                              key={day.dateStr}
                              className={`flex-1 border-r border-border/30 last:border-r-0 ${
                                day.isToday ? 'bg-primary/5' : day.isWeekend ? 'bg-surface-hover/50' : ''
                              }`}
                            />
                          ))}
                        </div>
                        <TimelineBar 
                          item={item} 
                          dayColumns={dayColumns}
                          onClick={() => setSelectedItem(item)}
                        />
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Goals Section */}
              {groupedItems.goals.length > 0 && (
                <>
                  <div className="flex bg-surface-hover/50 border-b border-border">
                    <div className="w-32 flex-shrink-0 p-2 text-xs font-semibold text-text flex items-center gap-2 border-r border-border">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <circle cx="12" cy="12" r="6" />
                        <circle cx="12" cy="12" r="2" />
                      </svg>
                      Goals
                    </div>
                    <div className="flex-1" />
                  </div>
                  {groupedItems.goals.map((item) => (
                    <div key={item.id} className="flex border-b border-border hover:bg-surface-hover/30">
                      <div className="w-32 flex-shrink-0 p-2 text-xs truncate border-r border-border text-text">
                        {item.title}
                      </div>
                      <div className="flex-1 relative h-9">
                        <div className="absolute inset-0 flex">
                          {dayColumns.map((day) => (
                            <div
                              key={day.dateStr}
                              className={`flex-1 border-r border-border/30 last:border-r-0 ${
                                day.isToday ? 'bg-primary/5' : day.isWeekend ? 'bg-surface-hover/50' : ''
                              }`}
                            />
                          ))}
                        </div>
                        <TimelineBar 
                          item={item} 
                          dayColumns={dayColumns}
                          onClick={() => setSelectedItem(item)}
                        />
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Tasks Section */}
              {groupedItems.tasks.length > 0 && (
                <>
                  <div className="flex bg-surface-hover/50 border-b border-border">
                    <div className="w-32 flex-shrink-0 p-2 text-xs font-semibold text-text flex items-center gap-2 border-r border-border">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                      Tasks ({groupedItems.tasks.length})
                    </div>
                    <div className="flex-1" />
                  </div>
                  {groupedItems.tasks.slice(0, 15).map((item) => (
                    <div key={item.id} className="flex border-b border-border hover:bg-surface-hover/30">
                      <div className="w-32 flex-shrink-0 p-2 text-xs truncate border-r border-border text-text">
                        {item.title}
                      </div>
                      <div className="flex-1 relative h-9">
                        <div className="absolute inset-0 flex">
                          {dayColumns.map((day) => (
                            <div
                              key={day.dateStr}
                              className={`flex-1 border-r border-border/30 last:border-r-0 ${
                                day.isToday ? 'bg-primary/5' : day.isWeekend ? 'bg-surface-hover/50' : ''
                              }`}
                            />
                          ))}
                        </div>
                        <TimelineBar 
                          item={item} 
                          dayColumns={dayColumns}
                          onClick={() => setSelectedItem(item)}
                        />
                      </div>
                    </div>
                  ))}
                  {groupedItems.tasks.length > 15 && (
                    <div className="flex border-b border-border">
                      <div className="w-32 flex-shrink-0 p-2 text-xs text-text-muted italic border-r border-border">
                        +{groupedItems.tasks.length - 15} more
                      </div>
                      <div className="flex-1" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Selected Item Detail */}
      {selectedItem && (
        <Card variant="bordered" className="border-l-4" style={{ borderLeftColor: selectedItem.color }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={selectedItem.type === 'project' ? 'primary' : selectedItem.type === 'goal' ? 'success' : 'secondary'}>
                  {selectedItem.type}
                </Badge>
                <h3 className="font-semibold text-text">{selectedItem.title}</h3>
              </div>
              <div className="text-sm text-text-muted space-y-1">
                <p>
                  <span className="font-medium">Duration:</span>{' '}
                  {selectedItem.startDate.toLocaleDateString()} — {selectedItem.endDate.toLocaleDateString()}
                </p>
                {selectedItem.progress !== undefined && (
                  <p>
                    <span className="font-medium">Progress:</span> {selectedItem.progress}%
                  </p>
                )}
                <p>
                  <span className="font-medium">Status:</span> {selectedItem.status}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}>
              ✕
            </Button>
          </div>
        </Card>
      )}

      {/* Upcoming Deadlines */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Upcoming Deadlines</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const upcoming = timelineItems
              .filter(i => i.endDate >= new Date())
              .sort((a, b) => a.endDate.getTime() - b.endDate.getTime())
              .slice(0, 5);

            if (upcoming.length === 0) {
              return <p className="text-text-muted text-sm">No upcoming deadlines</p>;
            }

            return (
              <div className="space-y-2">
                {upcoming.map((item) => {
                  const daysUntil = Math.ceil((item.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const isUrgent = daysUntil <= 3;
                  const isWarning = daysUntil <= 7;

                  return (
                    <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-surface-hover">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm text-text">{item.title}</span>
                        <Badge variant="secondary" className="text-xs">
                          {item.type}
                        </Badge>
                      </div>
                      <Badge variant={isUrgent ? 'danger' : isWarning ? 'warning' : 'secondary'}>
                        {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
