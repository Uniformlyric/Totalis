import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import type { Task, Project, Milestone } from '@totalis/shared';
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
  type: 'project' | 'task' | 'milestone';
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
  onClick?: (e?: React.MouseEvent) => void;
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
      onClick={(e) => onClick?.(e)}
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
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string | null>(null);

  // Data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

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
        const { subscribeToMilestones } = await import('@/lib/db/milestones');

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

        // Subscribe to milestones (for all projects)
        const unsubMilestones = subscribeToMilestones(user.uid, (updatedMilestones) => {
          setMilestones(updatedMilestones);
        });
        unsubscribes.push(unsubMilestones);
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

  // Filter projects based on selection
  const filteredProjects = useMemo(() => {
    if (!selectedProjectFilter) return projects;
    return projects.filter(p => p.id === selectedProjectFilter);
  }, [projects, selectedProjectFilter]);

  // Convert data to timeline items
  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = [];

    // Only add filtered projects as timeline items
    filteredProjects.forEach((project) => {
      const endD = project.deadline ? toSafeDate(project.deadline) : null;
      const startD = toSafeDate(project.startDate) || toSafeDate(project.createdAt) || new Date();
      
      // Calculate progress
      const progress = project.taskCount > 0
        ? Math.round((project.completedTaskCount / project.taskCount) * 100)
        : 0;

      // Find the latest due date among project tasks or milestones
      const projectTasks = tasks.filter(t => t.projectId === project.id && t.dueDate);
      const projectMilestones = milestones.filter(m => m.projectId === project.id && m.deadline);
      
      let latestDueDate = endD;
      projectTasks.forEach(t => {
        const d = toSafeDate(t.dueDate);
        if (d && (!latestDueDate || d > latestDueDate)) {
          latestDueDate = d;
        }
      });
      projectMilestones.forEach(m => {
        const d = toSafeDate(m.deadline);
        if (d && (!latestDueDate || d > latestDueDate)) {
          latestDueDate = d;
        }
      });

      // Only show projects that have a deadline OR have tasks/milestones with due dates
      if (latestDueDate) {
        items.push({
          id: project.id,
          title: project.title,
          startDate: startD,
          endDate: latestDueDate,
          color: project.color || '#6366f1',
          type: 'project',
          status: project.status,
          progress,
        });
      }
    });

    // Sort projects by start date
    return items.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [tasks, filteredProjects, milestones]);

  // Group tasks by project and milestone for nested display
  interface MilestoneGroup {
    milestone: Milestone;
    tasks: TimelineItem[];
  }

  interface ProjectWithMilestones {
    project: TimelineItem;
    milestoneGroups: MilestoneGroup[];
    unassignedTasks: TimelineItem[]; // Tasks not in any milestone
    expanded: boolean;
  }

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(new Set());

  const projectsWithMilestones = useMemo(() => {
    const result: ProjectWithMilestones[] = [];

    timelineItems.forEach(projectItem => {
      // Get milestones for this project, sorted by order
      const projectMilestones = milestones
        .filter(m => m.projectId === projectItem.id)
        .sort((a, b) => a.order - b.order);

      // Get all tasks for this project that aren't completed
      const projectTasks = tasks
        .filter(t => t.projectId === projectItem.id && t.status !== 'completed');

      // Helper to create a TimelineItem from a task
      const taskToTimelineItem = (task: Task, index: number): TimelineItem => {
        const dueDate = toSafeDate(task.dueDate);
        // Use scheduled dates if available, otherwise show task as a short bar near due date
        const scheduledStart = toSafeDate(task.scheduledStart);
        const scheduledEnd = toSafeDate(task.scheduledEnd);
        
        let startD: Date;
        let endD: Date;
        
        if (scheduledStart && scheduledEnd) {
          // Use scheduled times
          startD = scheduledStart;
          endD = scheduledEnd;
        } else if (dueDate) {
          // Show task as 1-2 days ending on due date
          endD = dueDate;
          startD = new Date(dueDate.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day before
        } else {
          // No dates - skip or use today
          endD = new Date();
          startD = new Date();
        }
        
        return {
          id: task.id,
          title: task.title,
          startDate: startD,
          endDate: endD,
          color: projectItem.color,
          type: 'task' as const,
          status: task.status,
          projectId: task.projectId,
        };
      };

      // Group tasks by milestone
      const milestoneGroups: MilestoneGroup[] = projectMilestones.map(milestone => {
        const milestoneTasks = projectTasks
          .filter(t => t.milestoneId === milestone.id)
          .map(taskToTimelineItem);

        return {
          milestone,
          tasks: milestoneTasks,
        };
      });

      // Get tasks not assigned to any milestone
      const unassignedTasks = projectTasks
        .filter(t => !t.milestoneId)
        .map(taskToTimelineItem);

      result.push({
        project: projectItem,
        milestoneGroups,
        unassignedTasks,
        expanded: expandedProjects.has(projectItem.id),
      });
    });

    return result;
  }, [timelineItems, tasks, milestones, expandedProjects]);

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const toggleMilestoneExpanded = (milestoneId: string) => {
    setExpandedMilestones(prev => {
      const next = new Set(prev);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  };

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
          {/* Project Filter */}
          <select
            value={selectedProjectFilter || ''}
            onChange={(e) => setSelectedProjectFilter(e.target.value || null)}
            className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          
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
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-primary" />
          <span className="text-text-muted">Project</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rotate-45 bg-warning" />
          <span className="text-text-muted">Milestone</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-2 rounded bg-primary/60" />
          <span className="text-text-muted">Task</span>
        </div>
        <span className="text-text-muted text-xs ml-auto">Click to expand • Tasks shown in project order</span>
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
                <div className="w-48 flex-shrink-0 p-2 text-xs font-medium text-text-muted border-r border-border">
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

              {/* Projects with Nested Milestones and Tasks */}
              {projectsWithMilestones.length > 0 ? (
                projectsWithMilestones.map(({ project, milestoneGroups, unassignedTasks, expanded }) => {
                  const totalItems = milestoneGroups.reduce((sum, mg) => sum + mg.tasks.length, 0) + unassignedTasks.length + milestoneGroups.length;
                  
                  return (
                    <div key={project.id}>
                      {/* Project Row */}
                      <div 
                        className="flex border-b border-border hover:bg-surface-hover/30 cursor-pointer"
                        onClick={() => toggleProjectExpanded(project.id)}
                      >
                        <div className="w-48 flex-shrink-0 p-2 text-sm font-medium border-r border-border text-text flex items-center gap-2">
                          <span className="text-text-muted text-xs">
                            {expanded ? '▼' : '▶'}
                          </span>
                          <span className="truncate flex-1">{project.title}</span>
                          {totalItems > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {totalItems}
                            </Badge>
                          )}
                        </div>
                        <div className="flex-1 relative h-10">
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
                            item={project} 
                            dayColumns={dayColumns}
                            onClick={(e) => {
                              e?.stopPropagation();
                              setSelectedItem(project);
                            }}
                          />
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {expanded && (
                        <>
                          {/* Milestones with their tasks */}
                          {milestoneGroups.map(({ milestone, tasks: milestoneTasks }) => {
                            const milestoneDeadline = toSafeDate(milestone.deadline);
                            const milestoneExpanded = expandedMilestones.has(milestone.id);
                            
                            return (
                              <div key={milestone.id}>
                                {/* Milestone Row */}
                                <div 
                                  className="flex border-b border-border/50 bg-warning/5 cursor-pointer hover:bg-warning/10"
                                  onClick={() => toggleMilestoneExpanded(milestone.id)}
                                >
                                  <div className="w-48 flex-shrink-0 p-2 text-xs border-r border-border text-warning pl-6 flex items-center gap-2">
                                    <span className="text-warning/60 text-[10px]">
                                      {milestoneExpanded ? '▼' : '▶'}
                                    </span>
                                    <span className="w-2 h-2 rotate-45 bg-warning flex-shrink-0" />
                                    <span className="truncate flex-1 font-medium">{milestone.title}</span>
                                    {milestoneTasks.length > 0 && (
                                      <Badge variant="warning" className="text-[10px]">
                                        {milestoneTasks.length}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex-1 relative h-8">
                                    <div className="absolute inset-0 flex">
                                      {dayColumns.map((day) => (
                                        <div
                                          key={day.dateStr}
                                          className={`flex-1 border-r border-border/20 last:border-r-0 ${
                                            day.isToday ? 'bg-primary/5' : ''
                                          }`}
                                        />
                                      ))}
                                    </div>
                                    {milestoneDeadline && (
                                      <MilestoneMarker
                                        date={milestoneDeadline}
                                        title={milestone.title}
                                        dayColumns={dayColumns}
                                      />
                                    )}
                                  </div>
                                </div>

                                {/* Tasks under this milestone */}
                                {milestoneExpanded && milestoneTasks.map((task) => (
                                  <div key={task.id} className="flex border-b border-border/30 bg-surface-hover/10">
                                    <div className="w-48 flex-shrink-0 p-1.5 text-[11px] border-r border-border text-text-secondary pl-10 truncate">
                                      {task.title}
                                    </div>
                                    <div className="flex-1 relative h-6">
                                      <div className="absolute inset-0 flex">
                                        {dayColumns.map((day) => (
                                          <div
                                            key={day.dateStr}
                                            className={`flex-1 border-r border-border/10 last:border-r-0 ${
                                              day.isToday ? 'bg-primary/5' : ''
                                            }`}
                                          />
                                        ))}
                                      </div>
                                      {(() => {
                                        const startIdx = Math.max(0, dayColumns.findIndex(d => d.dateStr >= task.startDate.toISOString().split('T')[0]));
                                        let endIdx = dayColumns.findIndex(d => d.dateStr > task.endDate.toISOString().split('T')[0]);
                                        if (endIdx === -1) endIdx = dayColumns.length;
                                        const span = Math.max(1, endIdx - startIdx);
                                        
                                        return (
                                          <div
                                            className="absolute h-3 rounded flex items-center px-1 cursor-pointer transition-all hover:brightness-110 overflow-hidden"
                                            style={{
                                              left: `${(startIdx / dayColumns.length) * 100}%`,
                                              width: `${(span / dayColumns.length) * 100}%`,
                                              backgroundColor: `${task.color}60`,
                                              top: '6px',
                                            }}
                                            onClick={() => setSelectedItem(task)}
                                            title={`${task.title}\n${task.startDate.toLocaleDateString()} - ${task.endDate.toLocaleDateString()}`}
                                          />
                                        );
                                      })()}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}

                          {/* Unassigned Tasks (not in any milestone) */}
                          {unassignedTasks.length > 0 && (
                            <>
                              {milestoneGroups.length > 0 && (
                                <div className="flex border-b border-border/50 bg-surface-hover/30">
                                  <div className="w-48 flex-shrink-0 p-1.5 text-[10px] border-r border-border text-text-muted pl-6 uppercase tracking-wide">
                                    Other Tasks
                                  </div>
                                  <div className="flex-1" />
                                </div>
                              )}
                              {unassignedTasks.map((task) => (
                                <div key={task.id} className="flex border-b border-border/30 bg-surface-hover/10">
                                  <div className="w-48 flex-shrink-0 p-1.5 text-[11px] border-r border-border text-text-secondary pl-8 truncate">
                                    {task.title}
                                  </div>
                                  <div className="flex-1 relative h-6">
                                    <div className="absolute inset-0 flex">
                                      {dayColumns.map((day) => (
                                        <div
                                          key={day.dateStr}
                                          className={`flex-1 border-r border-border/10 last:border-r-0 ${
                                            day.isToday ? 'bg-primary/5' : ''
                                          }`}
                                        />
                                      ))}
                                    </div>
                                    {(() => {
                                      const startIdx = Math.max(0, dayColumns.findIndex(d => d.dateStr >= task.startDate.toISOString().split('T')[0]));
                                      let endIdx = dayColumns.findIndex(d => d.dateStr > task.endDate.toISOString().split('T')[0]);
                                      if (endIdx === -1) endIdx = dayColumns.length;
                                      const span = Math.max(1, endIdx - startIdx);
                                      
                                      return (
                                        <div
                                          className="absolute h-3 rounded flex items-center px-1 cursor-pointer transition-all hover:brightness-110 overflow-hidden"
                                          style={{
                                            left: `${(startIdx / dayColumns.length) * 100}%`,
                                            width: `${(span / dayColumns.length) * 100}%`,
                                            backgroundColor: `${task.color}60`,
                                            top: '6px',
                                          }}
                                          onClick={() => setSelectedItem(task)}
                                          title={`${task.title}\n${task.startDate.toLocaleDateString()} - ${task.endDate.toLocaleDateString()}`}
                                        />
                                      );
                                    })()}
                                  </div>
                                </div>
                              ))}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-text-muted">
                  <p>No projects with deadlines or scheduled tasks.</p>
                  <p className="text-sm mt-1">Create a project with a deadline or add due dates to tasks.</p>
                </div>
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
                <Badge variant={selectedItem.type === 'project' ? 'primary' : selectedItem.type === 'milestone' ? 'warning' : 'secondary'}>
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
