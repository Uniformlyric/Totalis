import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import type { Task, Project, Milestone } from '@totalis/shared';
import type { User } from 'firebase/auth';

type ViewMode = 'week' | 'month' | 'quarter';

// Helper to safely convert Firestore Timestamp or date string to Date
function toSafeDate(value: unknown): Date | null {
  if (!value) return null;
  try {
    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate();
    }
    const date = new Date(value as string | number);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

interface DayColumn {
  date: Date;
  dateStr: string;
  isToday: boolean;
  isWeekend: boolean;
  dayOfMonth: number;
  dayName: string;
  monthName: string;
  isFirstOfMonth: boolean;
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
      isFirstOfMonth: date.getDate() === 1,
    });
  }

  return columns;
}

// Calculate bar position
function getBarPosition(startDate: Date, endDate: Date, dayColumns: DayColumn[]) {
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  
  let startIdx = dayColumns.findIndex(d => d.dateStr >= startStr);
  let endIdx = dayColumns.findIndex(d => d.dateStr > endStr);
  
  if (startIdx === -1) startIdx = 0;
  if (endIdx === -1) endIdx = dayColumns.length;
  
  const span = Math.max(1, endIdx - startIdx);
  const leftPercent = (startIdx / dayColumns.length) * 100;
  const widthPercent = (span / dayColumns.length) * 100;
  
  return { leftPercent, widthPercent, isVisible: span > 0 };
}

export function InteractiveTimelinePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(new Set());

  // Data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  // Refs for scrolling
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  // Days to show based on view mode
  const daysToShow = useMemo(() => {
    switch (viewMode) {
      case 'week': return 21;
      case 'month': return 42;
      case 'quarter': return 90;
    }
  }, [viewMode]);

  // Generate day columns
  const dayColumns = useMemo(() => {
    return generateDayColumns(startDate, daysToShow);
  }, [startDate, daysToShow]);

  // Mouse handlers for click-to-drag scrolling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollLeft.current = scrollContainerRef.current.scrollLeft;
    scrollContainerRef.current.style.cursor = 'grabbing';
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = 'grab';
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDragging.current = false;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = 'grab';
    }
  }, []);

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
        const { subscribeToAllMilestones } = await import('@/lib/db/milestones');

        const unsubTasks = subscribeToTasks((updatedTasks) => {
          setTasks(updatedTasks);
          setIsLoading(false);
        });
        unsubscribes.push(unsubTasks);

        const unsubProjects = subscribeToProjects(user.uid, (updatedProjects) => {
          setProjects(updatedProjects);
        });
        unsubscribes.push(unsubProjects);

        const unsubMilestones = subscribeToAllMilestones(user.uid, (updatedMilestones) => {
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
    if (!isLoading && scrollContainerRef.current) {
      const todayIdx = dayColumns.findIndex(d => d.isToday);
      if (todayIdx !== -1) {
        const containerWidth = scrollContainerRef.current.clientWidth;
        const contentWidth = scrollContainerRef.current.scrollWidth;
        const dayWidth = contentWidth / dayColumns.length;
        const scrollPos = Math.max(0, (todayIdx * dayWidth) - (containerWidth / 3));
        scrollContainerRef.current.scrollLeft = scrollPos;
      }
    }
  }, [isLoading, dayColumns]);

  // Expand all projects and milestones by default when data loads
  useEffect(() => {
    if (projects.length > 0) {
      setExpandedProjects(new Set(projects.map(p => p.id)));
    }
  }, [projects]);

  useEffect(() => {
    if (milestones.length > 0) {
      setExpandedMilestones(new Set(milestones.map(m => m.id)));
    }
  }, [milestones]);

  // Filter projects
  const filteredProjects = useMemo(() => {
    if (!selectedProjectFilter) return projects;
    return projects.filter(p => p.id === selectedProjectFilter);
  }, [projects, selectedProjectFilter]);

  // Build timeline data structure
  interface TimelineProject {
    id: string;
    title: string;
    color: string;
    startDate: Date;
    endDate: Date;
    progress: number;
    milestones: TimelineMilestone[];
    unassignedTasks: TimelineTask[];
  }

  interface TimelineMilestone {
    id: string;
    title: string;
    order: number;
    deadline: Date | null;
    tasks: TimelineTask[];
    progress: number;
  }

  interface TimelineTask {
    id: string;
    title: string;
    startDate: Date;
    endDate: Date;
    status: string;
  }

  const timelineData = useMemo((): TimelineProject[] => {
    return filteredProjects
      .filter(project => {
        // Only show projects that have deadlines or tasks with due dates
        const hasDeadline = !!project.deadline;
        const hasDatedTasks = tasks.some(t => t.projectId === project.id && t.dueDate);
        const hasMilestones = milestones.some(m => m.projectId === project.id);
        return hasDeadline || hasDatedTasks || hasMilestones;
      })
      .map(project => {
        const projectMilestones = milestones
          .filter(m => m.projectId === project.id)
          .sort((a, b) => a.order - b.order);

        // Include all tasks, not just incomplete ones
        const projectTasks = tasks.filter(t => t.projectId === project.id);

        // Build milestones with their tasks
        const timelineMilestones: TimelineMilestone[] = projectMilestones.map(m => {
          const milestoneTasks = projectTasks
            .filter(t => t.milestoneId === m.id)
            .map(t => {
              const dueDate = toSafeDate(t.dueDate) || new Date();
              // Task bar: 1 day ending on due date (or scheduled times if available)
              const scheduledStart = toSafeDate(t.scheduledStart);
              const scheduledEnd = toSafeDate(t.scheduledEnd);
              
              return {
                id: t.id,
                title: t.title,
                startDate: scheduledStart || new Date(dueDate.getTime() - 24 * 60 * 60 * 1000),
                endDate: scheduledEnd || dueDate,
                status: t.status,
              };
            });

          return {
            id: m.id,
            title: m.title,
            order: m.order,
            deadline: toSafeDate(m.deadline),
            tasks: milestoneTasks,
            progress: m.progress || 0,
          };
        });

        // Tasks not in any milestone
        const unassignedTasks = projectTasks
          .filter(t => !t.milestoneId)
          .map(t => {
            const dueDate = toSafeDate(t.dueDate) || new Date();
            const scheduledStart = toSafeDate(t.scheduledStart);
            const scheduledEnd = toSafeDate(t.scheduledEnd);
            
            return {
              id: t.id,
              title: t.title,
              startDate: scheduledStart || new Date(dueDate.getTime() - 24 * 60 * 60 * 1000),
              endDate: scheduledEnd || dueDate,
              status: t.status,
            };
          });

        // Calculate project date range
        const projectStart = toSafeDate(project.startDate) || toSafeDate(project.createdAt) || new Date();
        let projectEnd = toSafeDate(project.deadline);
        
        // If no deadline, use latest task/milestone date
        if (!projectEnd) {
          const allDates = [
            ...projectTasks.map(t => toSafeDate(t.dueDate)).filter(Boolean) as Date[],
            ...projectMilestones.map(m => toSafeDate(m.deadline)).filter(Boolean) as Date[],
          ];
          projectEnd = allDates.length > 0 ? new Date(Math.max(...allDates.map(d => d.getTime()))) : new Date();
        }

        return {
          id: project.id,
          title: project.title,
          color: project.color || '#6366f1',
          startDate: projectStart,
          endDate: projectEnd,
          progress: project.taskCount > 0 ? Math.round((project.completedTaskCount / project.taskCount) * 100) : 0,
          milestones: timelineMilestones,
          unassignedTasks,
        };
      })
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [filteredProjects, tasks, milestones]);

  // Navigation
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

  const toggleProject = (id: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMilestone = (id: string) => {
    setExpandedMilestones(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  const dateRangeText = `${dayColumns[0]?.monthName} ${dayColumns[0]?.date.getFullYear()} — ${dayColumns[dayColumns.length - 1]?.monthName} ${dayColumns[dayColumns.length - 1]?.date.getFullYear()}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Project Timeline</h1>
          <p className="text-text-secondary text-sm mt-1">{dateRangeText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            <Button variant="secondary" size="sm" onClick={() => navigateTimeline('prev')}>←</Button>
            <Button variant="secondary" size="sm" onClick={() => navigateTimeline('today')}>Today</Button>
            <Button variant="secondary" size="sm" onClick={() => navigateTimeline('next')}>→</Button>
          </div>

          {/* View Mode */}
          <div className="flex gap-1">
            {(['week', 'month', 'quarter'] as ViewMode[]).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setViewMode(mode)}
              >
                {mode === 'week' ? '3 Weeks' : mode === 'month' ? '6 Weeks' : 'Quarter'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-3 rounded bg-primary" />
          <span>Project</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rotate-45 bg-warning" />
          <span>Milestone</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-2 rounded bg-primary/50" />
          <span>Task</span>
        </div>
        <span className="ml-auto">Drag to scroll • Click rows to expand</span>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <Card variant="bordered">
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </Card>
      ) : timelineData.length === 0 ? (
        <Card variant="bordered">
          <div className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-surface-hover rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-text mb-2">No Projects to Display</h3>
            <p className="text-text-muted max-w-md mx-auto">
              Create a project with milestones and tasks to see them on the timeline.
            </p>
          </div>
        </Card>
      ) : (
        <Card variant="bordered" className="overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="overflow-x-auto overflow-y-auto select-none max-h-[70vh]"
            style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <div style={{ minWidth: `${Math.max(1200, daysToShow * 32)}px` }}>
              {/* Timeline Header - Dates */}
              <div className="flex border-b border-border sticky top-0 bg-surface z-20">
                <div className="w-56 flex-shrink-0 p-2 text-xs font-medium text-text-muted border-r border-border bg-surface sticky left-0 z-30">
                  Name
                </div>
                <div className="flex-1 flex">
                  {dayColumns.map((day) => (
                    <div
                      key={day.dateStr}
                      className={`flex-1 text-center py-1 text-[10px] border-r border-border/50 last:border-r-0 ${
                        day.isToday
                          ? 'bg-primary/20 font-bold text-primary'
                          : day.isWeekend
                            ? 'bg-surface-hover/50 text-text-muted'
                            : 'text-text-muted'
                      }`}
                    >
                      <div>{day.dayName}</div>
                      <div className={`font-medium ${day.isFirstOfMonth ? 'text-primary' : ''}`}>
                        {day.isFirstOfMonth ? day.monthName + ' ' : ''}{day.dayOfMonth}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Projects */}
              {timelineData.map((project) => {
                const isExpanded = expandedProjects.has(project.id);
                const totalItems = project.milestones.reduce((sum, m) => sum + m.tasks.length, 0) + project.unassignedTasks.length + project.milestones.length;
                const projectBar = getBarPosition(project.startDate, project.endDate, dayColumns);

                return (
                  <div key={project.id}>
                    {/* Project Row */}
                    <div
                      className="flex border-b border-border hover:bg-surface-hover/30 cursor-pointer"
                      onClick={() => toggleProject(project.id)}
                    >
                      <div className="w-56 flex-shrink-0 p-2 border-r border-border bg-surface sticky left-0 z-10 flex items-center gap-2">
                        <span className="text-text-muted text-xs">{isExpanded ? '▼' : '▶'}</span>
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: project.color }}
                        />
                        <span className="text-sm font-medium text-text truncate flex-1">{project.title}</span>
                        {totalItems > 0 && (
                          <Badge variant="secondary" className="text-[10px]">{totalItems}</Badge>
                        )}
                      </div>
                      <div className="flex-1 relative h-10">
                        {/* Grid */}
                        <div className="absolute inset-0 flex">
                          {dayColumns.map((day) => (
                            <div
                              key={day.dateStr}
                              className={`flex-1 border-r border-border/20 last:border-r-0 ${
                                day.isToday ? 'bg-primary/5' : day.isWeekend ? 'bg-surface-hover/30' : ''
                              }`}
                            />
                          ))}
                        </div>
                        {/* Project Bar */}
                        {projectBar.isVisible && (
                          <div
                            className="absolute h-6 rounded flex items-center px-2 overflow-hidden"
                            style={{
                              left: `${projectBar.leftPercent}%`,
                              width: `${projectBar.widthPercent}%`,
                              backgroundColor: project.color,
                              top: '8px',
                            }}
                            title={`${project.title}: ${project.startDate.toLocaleDateString()} - ${project.endDate.toLocaleDateString()}`}
                          >
                            <span className="text-[10px] text-white font-medium truncate">{project.title}</span>
                            {/* Progress */}
                            {project.progress > 0 && (
                              <div
                                className="absolute bottom-0 left-0 h-1 bg-white/40 rounded-b"
                                style={{ width: `${project.progress}%` }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <>
                        {/* Debug: Show if no content */}
                        {project.milestones.length === 0 && project.unassignedTasks.length === 0 && (
                          <div className="flex border-b border-border/30 bg-surface-hover/10">
                            <div className="w-56 flex-shrink-0 p-2 pl-6 border-r border-border bg-surface sticky left-0 z-10">
                              <span className="text-xs text-text-muted italic">No milestones or tasks with due dates</span>
                            </div>
                            <div className="flex-1" />
                          </div>
                        )}
                        {/* Milestones */}
                        {project.milestones.map((milestone) => {
                          const isMilestoneExpanded = expandedMilestones.has(milestone.id);
                          
                          return (
                            <div key={milestone.id}>
                              {/* Milestone Row */}
                              <div
                                className="flex border-b border-border/50 bg-warning/5 hover:bg-warning/10 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleMilestone(milestone.id);
                                }}
                              >
                                <div className="w-56 flex-shrink-0 p-1.5 pl-6 border-r border-border bg-warning/5 sticky left-0 z-10 flex items-center gap-2">
                                  <span className="text-warning/60 text-[10px]">{isMilestoneExpanded ? '▼' : '▶'}</span>
                                  <span className="w-2 h-2 rotate-45 bg-warning flex-shrink-0" />
                                  <span className="text-xs font-medium text-warning truncate flex-1">{milestone.title}</span>
                                  {milestone.tasks.length > 0 && (
                                    <Badge variant="warning" className="text-[9px]">{milestone.tasks.length}</Badge>
                                  )}
                                </div>
                                <div className="flex-1 relative h-7">
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
                                  {/* Milestone Diamond */}
                                  {milestone.deadline && (() => {
                                    const deadlineStr = milestone.deadline.toISOString().split('T')[0];
                                    const idx = dayColumns.findIndex(d => d.dateStr === deadlineStr);
                                    if (idx === -1) return null;
                                    const leftPercent = ((idx + 0.5) / dayColumns.length) * 100;
                                    return (
                                      <div
                                        className="absolute w-3 h-3 bg-warning rotate-45 border border-warning-dark"
                                        style={{ left: `${leftPercent}%`, top: '50%', transform: 'translate(-50%, -50%) rotate(45deg)' }}
                                        title={`${milestone.title}: ${milestone.deadline.toLocaleDateString()}`}
                                      />
                                    );
                                  })()}
                                </div>
                              </div>

                              {/* Tasks under milestone */}
                              {isMilestoneExpanded && milestone.tasks.map((task) => {
                                const taskBar = getBarPosition(task.startDate, task.endDate, dayColumns);
                                return (
                                  <div key={task.id} className="flex border-b border-border/30 bg-surface-hover/10">
                                    <div className="w-56 flex-shrink-0 p-1 pl-12 border-r border-border bg-surface sticky left-0 z-10">
                                      <span className="text-[11px] text-text-secondary truncate block">{task.title}</span>
                                    </div>
                                    <div className="flex-1 relative h-5">
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
                                      {taskBar.isVisible && (
                                        <div
                                          className="absolute h-2.5 rounded"
                                          style={{
                                            left: `${taskBar.leftPercent}%`,
                                            width: `${Math.max(1.5, taskBar.widthPercent)}%`,
                                            backgroundColor: `${project.color}70`,
                                            top: '5px',
                                          }}
                                          title={`${task.title}: ${task.endDate.toLocaleDateString()}`}
                                        />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}

                        {/* Unassigned Tasks */}
                        {project.unassignedTasks.length > 0 && (
                          <>
                            {project.milestones.length > 0 && (
                              <div className="flex border-b border-border/30 bg-surface-hover/20">
                                <div className="w-56 flex-shrink-0 p-1 pl-6 border-r border-border bg-surface sticky left-0 z-10">
                                  <span className="text-[10px] text-text-muted uppercase tracking-wide">Other Tasks</span>
                                </div>
                                <div className="flex-1" />
                              </div>
                            )}
                            {project.unassignedTasks.map((task) => {
                              const taskBar = getBarPosition(task.startDate, task.endDate, dayColumns);
                              return (
                                <div key={task.id} className="flex border-b border-border/30 bg-surface-hover/10">
                                  <div className="w-56 flex-shrink-0 p-1 pl-8 border-r border-border bg-surface sticky left-0 z-10">
                                    <span className="text-[11px] text-text-secondary truncate block">{task.title}</span>
                                  </div>
                                  <div className="flex-1 relative h-5">
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
                                    {taskBar.isVisible && (
                                      <div
                                        className="absolute h-2.5 rounded"
                                        style={{
                                          left: `${taskBar.leftPercent}%`,
                                          width: `${Math.max(1.5, taskBar.widthPercent)}%`,
                                          backgroundColor: `${project.color}70`,
                                          top: '5px',
                                        }}
                                        title={`${task.title}: ${task.endDate.toLocaleDateString()}`}
                                      />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
