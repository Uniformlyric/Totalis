import { useState, useEffect, useMemo, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
  useDraggable,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import type { Task, Project, Goal, Milestone } from '@totalis/shared';
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

interface TimelineItem {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  color: string;
  type: 'project' | 'task' | 'goal';
  status: string;
  projectId?: string;
  milestoneId?: string;
  progress?: number;
  estimatedMinutes?: number;
}

interface DayColumn {
  date: Date;
  dateStr: string;
  isToday: boolean;
  isWeekend: boolean;
  dayOfMonth: number;
  dayName: string;
  monthName: string;
  capacity: number; // hours scheduled
  availableHours: number; // based on working hours
}

interface DraggableBarProps {
  item: TimelineItem;
  dayColumns: DayColumn[];
  onEdit?: () => void;
  isDragging?: boolean;
}

function calculateDayCapacity(tasks: Task[], date: Date, workingHoursPerDay: number = 8): number {
  const dateStr = date.toISOString().split('T')[0];
  const scheduledMinutes = tasks
    .filter(t => {
      const dueDate = toSafeDate(t.dueDate);
      if (!dueDate) return false;
      return dueDate.toISOString().split('T')[0] === dateStr;
    })
    .reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
  return scheduledMinutes / 60; // convert to hours
}

function generateDayColumns(startDate: Date, days: number, tasks: Task[], workingHoursPerDay: number = 8): DayColumn[] {
  const columns: DayColumn[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const availableHours = isWeekend ? 0 : workingHoursPerDay;

    columns.push({
      date,
      dateStr,
      isToday: dateStr === today,
      isWeekend,
      dayOfMonth: date.getDate(),
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      monthName: date.toLocaleDateString('en-US', { month: 'short' }),
      capacity: calculateDayCapacity(tasks, date, workingHoursPerDay),
      availableHours,
    });
  }

  return columns;
}

function DraggableBar({ item, dayColumns, onEdit, isDragging }: DraggableBarProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: item.id,
    data: { item, dayColumns },
  });

  const startIdx = dayColumns.findIndex(d => d.dateStr >= item.startDate.toISOString().split('T')[0]);
  const endIdx = dayColumns.findIndex(d => d.dateStr > item.endDate.toISOString().split('T')[0]);
  
  const actualStart = startIdx === -1 ? 0 : startIdx;
  const actualEnd = endIdx === -1 ? dayColumns.length : endIdx;
  const span = actualEnd - actualStart;
  
  if (span <= 0) return null;

  const leftPercent = (actualStart / dayColumns.length) * 100;
  const widthPercent = (span / dayColumns.length) * 100;

  const style: React.CSSProperties = {
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
    backgroundColor: item.color,
    top: '6px',
  };

  if (transform) {
    style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0)`;
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`absolute h-8 rounded-lg flex items-center px-3 cursor-grab active:cursor-grabbing transition-all group ${
        isDragging ? 'opacity-50 scale-105' : 'hover:brightness-110 hover:shadow-lg hover:z-10'
      }`}
      style={style}
      title={`${item.title}\n${item.startDate.toLocaleDateString()} - ${item.endDate.toLocaleDateString()}\nDrag to reschedule`}
    >
      {/* Drag handle indicator */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
        <div className="w-1 h-1 rounded-full bg-white" />
        <div className="w-1 h-1 rounded-full bg-white" />
        <div className="w-1 h-1 rounded-full bg-white" />
      </div>

      <span className="text-xs font-medium text-white truncate drop-shadow-sm ml-2 flex-1">
        {item.title}
      </span>

      {/* Edit button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit?.();
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/20 rounded"
        title="Edit"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>

      {/* Progress indicator */}
      {item.progress !== undefined && item.progress > 0 && (
        <div 
          className="absolute bottom-0 left-0 h-1 bg-white/40 rounded-b-lg transition-all"
          style={{ width: `${item.progress}%` }}
        />
      )}

      {/* Resize handles */}
      <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l-lg opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r-lg opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

function MilestoneMarker({
  milestone,
  dayColumns,
  color,
}: {
  milestone: Milestone;
  dayColumns: DayColumn[];
  color: string;
}) {
  const deadline = toSafeDate(milestone.deadline);
  if (!deadline) return null;

  const dateStr = deadline.toISOString().split('T')[0];
  const idx = dayColumns.findIndex(d => d.dateStr === dateStr);
  
  if (idx === -1) return null;

  const leftPercent = ((idx + 0.5) / dayColumns.length) * 100;

  return (
    <div
      className="absolute flex flex-col items-center z-20 cursor-pointer group"
      style={{ left: `${leftPercent}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
      title={`Milestone: ${milestone.title}\nDeadline: ${deadline.toLocaleDateString()}`}
    >
      <div 
        className="w-3 h-3 rotate-45 border-2 transition-all group-hover:scale-125 group-hover:shadow-lg"
        style={{ 
          backgroundColor: color,
          borderColor: color,
          filter: 'brightness(0.9)'
        }}
      />
      <div className="absolute top-5 opacity-0 group-hover:opacity-100 transition-opacity bg-surface border border-border rounded px-2 py-1 text-xs whitespace-nowrap pointer-events-none shadow-lg">
        <div className="font-medium text-text">{milestone.title}</div>
        <div className="text-text-muted">{milestone.completedTaskCount}/{milestone.taskCount} tasks</div>
      </div>
    </div>
  );
}

function CapacityBar({ capacity, availableHours }: { capacity: number; availableHours: number }) {
  if (availableHours === 0) return null; // Don't show for weekends

  const utilizationPercent = availableHours > 0 ? (capacity / availableHours) * 100 : 0;
  const isOverbooked = utilizationPercent > 100;
  const isNearCapacity = utilizationPercent > 80;

  const getColor = () => {
    if (isOverbooked) return 'bg-red-500';
    if (isNearCapacity) return 'bg-orange-400';
    if (utilizationPercent > 50) return 'bg-yellow-400';
    return 'bg-green-500';
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 h-1">
      <div 
        className={`h-full transition-all ${getColor()}`}
        style={{ width: `${Math.min(100, utilizationPercent)}%` }}
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
        Items with start and end dates will appear as draggable bars on the Gantt chart.
      </p>
    </div>
  );
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
  const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null);
  const [draggedItem, setDraggedItem] = useState<TimelineItem | null>(null);
  const [showCapacity, setShowCapacity] = useState(true);
  const [showMilestones, setShowMilestones] = useState(true);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({
    projects: false,
    goals: false,
    tasks: false,
  });

  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  // Data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Days to show based on view mode
  const daysToShow = useMemo(() => {
    switch (viewMode) {
      case 'week': return 14;
      case 'month': return 35;
      case 'quarter': return 90;
    }
  }, [viewMode]);

  // Generate day columns with capacity
  const dayColumns = useMemo(() => {
    return generateDayColumns(startDate, daysToShow, tasks, 8);
  }, [startDate, daysToShow, tasks]);

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
        const { getDb } = await import('@/lib/firebase');
        const { collection, query, onSnapshot } = await import('firebase/firestore');

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

        // Subscribe to milestones
        const milestonesCol = collection(getDb(), 'users', user.uid, 'milestones');
        const milestonesQuery = query(milestonesCol);
        const unsubMilestones = onSnapshot(milestonesQuery, (snapshot) => {
          const allMilestones = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Milestone));
          setMilestones(allMilestones);
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

  // Convert data to timeline items
  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = [];
    const projectColors: Record<string, string> = {};

    projects.forEach((project) => {
      projectColors[project.id] = project.color || '#6366f1';
      
      if (project.deadline) {
        const endD = toSafeDate(project.deadline);
        if (!endD) return;
        
        const startD = toSafeDate(project.createdAt) || new Date();
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

    tasks
      .filter(t => t.dueDate && t.status !== 'completed')
      .forEach((task) => {
        const dueDate = toSafeDate(task.dueDate);
        if (!dueDate) return;
        
        const startD = toSafeDate(task.createdAt) || new Date(dueDate);
        startD.setHours(0, 0, 0, 0);
        
        const daysDiff = Math.max(1, Math.ceil((dueDate.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)));
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
          milestoneId: task.milestoneId,
          estimatedMinutes: task.estimatedMinutes,
        });
      });

    goals
      .filter(g => g.deadline && g.status !== 'completed')
      .forEach((goal) => {
        const deadline = toSafeDate(goal.deadline);
        if (!deadline) return;
        
        const startD = toSafeDate(goal.createdAt) || new Date();
        
        items.push({
          id: goal.id,
          title: goal.title,
          startDate: startD,
          endDate: deadline,
          color: '#10b981',
          type: 'goal',
          status: goal.status,
          progress: goal.progress,
        });
      });

    return items.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [tasks, projects, goals]);

  // Group items by type
  const groupedItems = useMemo(() => {
    return {
      projects: timelineItems.filter(i => i.type === 'project'),
      goals: timelineItems.filter(i => i.type === 'goal'),
      tasks: timelineItems.filter(i => i.type === 'task'),
    };
  }, [timelineItems]);

  // Calculate capacity stats
  const capacityStats = useMemo(() => {
    const overbooked = dayColumns.filter(d => !d.isWeekend && d.capacity > d.availableHours).length;
    const nearCapacity = dayColumns.filter(d => !d.isWeekend && d.capacity > d.availableHours * 0.8 && d.capacity <= d.availableHours).length;
    const totalCapacity = dayColumns.reduce((sum, d) => sum + d.availableHours, 0);
    const totalScheduled = dayColumns.reduce((sum, d) => sum + d.capacity, 0);

    return { overbooked, nearCapacity, totalCapacity, totalScheduled };
  }, [dayColumns]);

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const item = timelineItems.find(i => i.id === event.active.id);
    if (item) {
      setDraggedItem(item);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, delta } = event;
    
    if (!draggedItem) return;

    // Calculate day shift based on drag distance
    const gridElement = scrollRef.current;
    if (!gridElement) return;

    const gridWidth = gridElement.scrollWidth;
    const pixelsPerDay = gridWidth / dayColumns.length;
    const dayShift = Math.round(delta.x / pixelsPerDay);

    if (dayShift === 0) {
      setDraggedItem(null);
      return;
    }

    // Calculate new dates
    const newStartDate = new Date(draggedItem.startDate);
    newStartDate.setDate(newStartDate.getDate() + dayShift);
    
    const newEndDate = new Date(draggedItem.endDate);
    newEndDate.setDate(newEndDate.getDate() + dayShift);

    try {
      // Update the item in Firestore
      if (draggedItem.type === 'task') {
        const { updateTask } = await import('@/lib/db/tasks');
        await updateTask(draggedItem.id, {
          dueDate: newEndDate,
        });
      } else if (draggedItem.type === 'project') {
        const { updateProject } = await import('@/lib/db/projects');
        await updateProject(draggedItem.id, {
          deadline: newEndDate,
        });
      } else if (draggedItem.type === 'goal') {
        const { updateGoal } = await import('@/lib/db/goals');
        await updateGoal(draggedItem.id, {
          deadline: newEndDate,
        });
      }

      console.log(`✅ Rescheduled ${draggedItem.type} "${draggedItem.title}" by ${dayShift} days`);
    } catch (error) {
      console.error('Failed to update item:', error);
    }

    setDraggedItem(null);
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text">Interactive Timeline</h1>
            <p className="text-text-secondary mt-1">
              {dayColumns[0]?.monthName} {dayColumns[0]?.date.getFullYear()} — {dayColumns[dayColumns.length - 1]?.monthName} {dayColumns[dayColumns.length - 1]?.date.getFullYear()}
            </p>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span className="text-text-muted">
                📊 {capacityStats.totalScheduled.toFixed(1)}h scheduled / {capacityStats.totalCapacity}h available
              </span>
              {capacityStats.overbooked > 0 && (
                <span className="text-red-500 font-medium">
                  ⚠️ {capacityStats.overbooked} overbooked days
                </span>
              )}
            </div>
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
            {/* Toggle options */}
            <div className="flex gap-1">
              <Button
                variant={showCapacity ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setShowCapacity(!showCapacity)}
                title="Toggle capacity indicators"
              >
                📊
              </Button>
              <Button
                variant={showMilestones ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setShowMilestones(!showMilestones)}
                title="Toggle milestone markers"
              >
                💎
              </Button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-6 text-sm">
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
          {showCapacity && (
            <>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500" />
                <span className="text-text-muted">Under 50%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-400" />
                <span className="text-text-muted">50-80%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-400" />
                <span className="text-text-muted">80-100%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500" />
                <span className="text-text-muted">Overbooked</span>
              </div>
            </>
          )}
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
                <div className="flex border-b border-border sticky top-0 bg-surface z-20">
                  <div className="w-32 flex-shrink-0 p-2 text-xs font-medium text-text-muted border-r border-border bg-surface">
                    Item (Drag to reschedule)
                  </div>
                  <div className="flex-1 flex">
                    {dayColumns.map((day) => (
                      <div
                        key={day.dateStr}
                        className={`flex-1 text-center p-1 text-xs border-r border-border last:border-r-0 relative ${
                          day.isToday 
                            ? 'bg-primary/10 font-bold text-primary' 
                            : day.isWeekend 
                              ? 'bg-surface-hover text-text-muted' 
                              : 'text-text-muted'
                        }`}
                      >
                        <div>{day.dayName}</div>
                        <div className="font-medium">{day.dayOfMonth}</div>
                        {showCapacity && <CapacityBar capacity={day.capacity} availableHours={day.availableHours} />}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Projects Section */}
                {groupedItems.projects.length > 0 && (
                  <>
                    <button
                      onClick={() => toggleCategory('projects')}
                      className="flex w-full bg-surface-hover/50 border-b border-border sticky top-[52px] z-10 hover:bg-surface-hover transition-colors"
                    >
                      <div className="w-32 flex-shrink-0 p-2 text-xs font-semibold text-text flex items-center gap-2 border-r border-border">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${collapsedCategories.projects ? '-rotate-90' : ''}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3h18v18H3zM3 9h18M9 21V9"/>
                        </svg>
                        Projects ({groupedItems.projects.length})
                      </div>
                      <div className="flex-1" />
                    </button>
                    {!collapsedCategories.projects && groupedItems.projects.map((item) => {
                      const projectMilestones = milestones.filter(m => m.projectId === item.id && m.deadline);
                      
                      return (
                        <div key={item.id} className="flex border-b border-border hover:bg-surface-hover/30" data-item-id={item.id}>
                          <div className="w-32 flex-shrink-0 p-2 text-xs truncate border-r border-border text-text">
                            {item.title}
                          </div>
                          <div className="flex-1 relative h-12">
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
                            <DraggableBar 
                              item={item} 
                              dayColumns={dayColumns}
                              onEdit={() => setSelectedItem(item)}
                              isDragging={draggedItem?.id === item.id}
                            />
                            {showMilestones && projectMilestones.map(milestone => (
                              <MilestoneMarker 
                                key={milestone.id}
                                milestone={milestone}
                                dayColumns={dayColumns}
                                color={item.color}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Goals Section */}
                {groupedItems.goals.length > 0 && (
                  <>
                    <button
                      onClick={() => toggleCategory('goals')}
                      className="flex w-full bg-surface-hover/50 border-b border-border hover:bg-surface-hover transition-colors"
                    >
                      <div className="w-32 flex-shrink-0 p-2 text-xs font-semibold text-text flex items-center gap-2 border-r border-border">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${collapsedCategories.goals ? '-rotate-90' : ''}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <circle cx="12" cy="12" r="6" />
                          <circle cx="12" cy="12" r="2" />
                        </svg>
                        Goals ({groupedItems.goals.length})
                      </div>
                      <div className="flex-1" />
                    </button>
                    {!collapsedCategories.goals && groupedItems.goals.map((item) => (
                      <div key={item.id} className="flex border-b border-border hover:bg-surface-hover/30" data-item-id={item.id}>
                        <div className="w-32 flex-shrink-0 p-2 text-xs truncate border-r border-border text-text">
                          {item.title}
                        </div>
                        <div className="flex-1 relative h-12">
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
                          <DraggableBar 
                            item={item} 
                            dayColumns={dayColumns}
                            onEdit={() => setSelectedItem(item)}
                            isDragging={draggedItem?.id === item.id}
                          />
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Tasks Section */}
                {groupedItems.tasks.length > 0 && (
                  <>
                    <button
                      onClick={() => toggleCategory('tasks')}
                      className="flex w-full bg-surface-hover/50 border-b border-border hover:bg-surface-hover transition-colors"
                    >
                      <div className="w-32 flex-shrink-0 p-2 text-xs font-semibold text-text flex items-center gap-2 border-r border-border">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${collapsedCategories.tasks ? '-rotate-90' : ''}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 11l3 3L22 4" />
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                        Tasks ({groupedItems.tasks.length})
                      </div>
                      <div className="flex-1" />
                    </button>
                    {!collapsedCategories.tasks && groupedItems.tasks.slice(0, 20).map((item) => (
                      <div key={item.id} className="flex border-b border-border hover:bg-surface-hover/30" data-item-id={item.id}>
                        <div className="w-32 flex-shrink-0 p-2 text-xs truncate border-r border-border text-text flex items-center gap-1">
                          {item.estimatedMinutes && (
                            <span className="text-text-muted" title={`${item.estimatedMinutes} minutes`}>
                              ⏱️
                            </span>
                          )}
                          {item.title}
                        </div>
                        <div className="flex-1 relative h-12">
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
                          <DraggableBar 
                            item={item} 
                            dayColumns={dayColumns}
                            onEdit={() => setSelectedItem(item)}
                            isDragging={draggedItem?.id === item.id}
                          />
                        </div>
                      </div>
                    ))}
                    {groupedItems.tasks.length > 20 && (
                      <div className="flex border-b border-border">
                        <div className="w-32 flex-shrink-0 p-2 text-xs text-text-muted italic border-r border-border">
                          +{groupedItems.tasks.length - 20} more
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
                  {selectedItem.estimatedMinutes && (
                    <p>
                      <span className="font-medium">Estimated:</span> {selectedItem.estimatedMinutes} minutes
                    </p>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}>
                ✕
              </Button>
            </div>
          </Card>
        )}

        {/* Capacity Summary */}
        {showCapacity && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card variant="bordered">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-text">{capacityStats.totalScheduled.toFixed(1)}h</div>
                <div className="text-sm text-text-muted">Total Scheduled</div>
              </CardContent>
            </Card>
            <Card variant="bordered">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-text">{capacityStats.totalCapacity}h</div>
                <div className="text-sm text-text-muted">Available Capacity</div>
              </CardContent>
            </Card>
            <Card variant="bordered">
              <CardContent className="p-4">
                <div className={`text-2xl font-bold ${capacityStats.overbooked > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {capacityStats.overbooked}
                </div>
                <div className="text-sm text-text-muted">Overbooked Days</div>
              </CardContent>
            </Card>
            <Card variant="bordered">
              <CardContent className="p-4">
                <div className={`text-2xl font-bold ${capacityStats.nearCapacity > 0 ? 'text-orange-400' : 'text-text'}`}>
                  {capacityStats.nearCapacity}
                </div>
                <div className="text-sm text-text-muted">Near Capacity</div>
              </CardContent>
            </Card>
          </div>
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
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-surface-hover hover:bg-surface transition-colors cursor-pointer" onClick={() => setSelectedItem(item)}>
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

      {/* Drag Overlay */}
      <DragOverlay>
        {draggedItem ? (
          <div
            className="h-8 rounded-lg flex items-center px-3 opacity-80 shadow-2xl"
            style={{ backgroundColor: draggedItem.color, minWidth: '150px' }}
          >
            <span className="text-xs font-medium text-white truncate">
              {draggedItem.title}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
