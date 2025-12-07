import { useState, useMemo, useRef } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { Badge, Button, Card } from '@/components/ui';
import type { Task, Habit } from '@totalis/shared';

interface TimeBlockViewProps {
  date: Date;
  tasks: Task[];
  habits: Habit[];
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
  onTaskClick?: (task: Task) => void;
  onCreateTask?: (scheduledStart: Date) => void;
  workingHours?: { start: string; end: string };
}

// Constants
const SLOT_HEIGHT = 60; // pixels per 30-minute slot
const START_HOUR = 6;
const END_HOUR = 23;

// Helper to safely convert Firestore Timestamp or date string to Date
function toSafeDate(value: unknown): Date | null {
  if (!value) return null;
  try {
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      return (value as { toDate: () => Date }).toDate();
    }
    const date = new Date(value as string | number);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

function formatTimeShort(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  if (minute === 0) {
    return `${displayHour}${period}`;
  }
  return `${displayHour}:${minute.toString().padStart(2, '0')}`;
}

// Draggable unscheduled task in sidebar
function DraggableSidebarTask({
  task,
  onClick,
  isDragging,
}: {
  task: Task;
  onClick: () => void;
  isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  };

  const getPriorityColor = () => {
    switch (task.priority) {
      case 'urgent': return 'border-l-red-500 bg-red-500/10';
      case 'high': return 'border-l-orange-500 bg-orange-500/10';
      case 'medium': return 'border-l-yellow-500 bg-yellow-500/10';
      default: return 'border-l-blue-500 bg-blue-500/10';
    }
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      onClick={onClick}
      className={`
        group relative p-2 rounded-lg border-l-4 cursor-grab active:cursor-grabbing
        transition-all hover:shadow-md
        ${getPriorityColor()}
        ${isDragging ? 'opacity-50 scale-95' : ''}
        ${task.status === 'completed' ? 'opacity-60' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${task.status === 'completed' ? 'line-through' : ''}`}>
            {task.title}
          </p>
          {task.estimatedMinutes && (
            <p className="text-xs text-text-muted mt-1">
              ⏱️ {task.estimatedMinutes}min
            </p>
          )}
        </div>
        <Badge variant="secondary" size="sm">
          {task.priority || 'medium'}
        </Badge>
      </div>
    </div>
  );
}

// Scheduled task block that appears on the calendar grid
function ScheduledTaskBlock({
  task,
  topOffset,
  height,
  onClick,
  isDragging,
}: {
  task: Task;
  topOffset: number;
  height: number;
  onClick: () => void;
  isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
    data: { task },
  });

  const startDate = toSafeDate(task.scheduledStart)!;
  const startHour = startDate.getHours();
  const startMinute = startDate.getMinutes();
  const duration = task.estimatedMinutes || 30;
  const endMinutes = startHour * 60 + startMinute + duration;
  const endHour = Math.floor(endMinutes / 60);
  const endMinute = endMinutes % 60;

  const getPriorityColors = () => {
    switch (task.priority) {
      case 'urgent': return 'border-red-500 bg-red-500/20 hover:bg-red-500/30';
      case 'high': return 'border-orange-500 bg-orange-500/20 hover:bg-orange-500/30';
      case 'medium': return 'border-yellow-500 bg-yellow-500/20 hover:bg-yellow-500/30';
      default: return 'border-blue-500 bg-blue-500/20 hover:bg-blue-500/30';
    }
  };

  const style: React.CSSProperties = {
    position: 'absolute',
    top: `${topOffset}px`,
    left: '80px',
    right: '8px',
    height: `${height}px`,
    zIndex: isDragging ? 50 : 10,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      onClick={onClick}
      className={`
        rounded-lg border-l-4 cursor-grab active:cursor-grabbing
        transition-all shadow-sm hover:shadow-md
        ${getPriorityColors()}
        ${isDragging ? 'opacity-70 scale-[1.02]' : ''}
        ${task.status === 'completed' ? 'opacity-60' : ''}
        overflow-hidden
      `}
    >
      <div className="p-2 h-full flex flex-col">
        {/* Time range header */}
        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
          <span className="font-medium">
            {formatTimeShort(startHour, startMinute)} - {formatTimeShort(endHour, endMinute)}
          </span>
          <span>⏱️ {duration}min</span>
        </div>
        
        {/* Task title */}
        <p className={`text-sm font-semibold flex-1 ${task.status === 'completed' ? 'line-through' : ''}`}>
          {task.title}
        </p>
        
        {/* Priority badge at bottom if there's room */}
        {height > 80 && (
          <div className="flex items-center justify-between mt-auto pt-1">
            <Badge
              variant={task.status === 'completed' ? 'success' : 'secondary'}
              size="sm"
            >
              {task.status === 'completed' ? '✓ Done' : task.priority || 'medium'}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

// Droppable time slot row
function TimeSlotRow({
  hour,
  minute,
  isWorkingHour,
  isOver,
  onClick,
}: {
  hour: number;
  minute: number;
  isWorkingHour: boolean;
  isOver: boolean;
  onClick: () => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `slot-${hour}-${minute}`,
    data: { hour, minute },
  });

  const showTimeLabel = minute === 0; // Only show time at the hour

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      style={{ height: `${SLOT_HEIGHT}px` }}
      className={`
        flex items-stretch border-b cursor-pointer
        transition-colors group
        ${minute === 0 ? 'border-border' : 'border-border/30'}
        ${!isWorkingHour ? 'bg-surface-hover/20' : ''}
        ${isOver ? 'bg-primary/10 border-primary' : 'hover:bg-surface-hover/50'}
      `}
    >
      {/* Time label column */}
      <div className="w-20 flex-shrink-0 flex items-start justify-end pr-3 pt-1">
        {showTimeLabel && (
          <span className="text-xs font-medium text-text-muted">
            {formatTime(hour, minute)}
          </span>
        )}
      </div>
      
      {/* Content area */}
      <div className="flex-1 relative border-l border-border/50">
        {/* Drop indicator */}
        {isOver && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <span className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
              📍 Drop here
            </span>
          </div>
        )}
        
        {/* Add button on hover */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="absolute right-2 top-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:underline z-5"
        >
          + Add task
        </button>
      </div>
    </div>
  );
}

export function TimeBlockView({
  date,
  tasks,
  habits,
  onTaskUpdate,
  onTaskClick,
  onCreateTask,
  workingHours = { start: '09:00', end: '17:00' },
}: TimeBlockViewProps) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const [suggestedTask, setSuggestedTask] = useState<Task | null>(null);
  const [overSlot, setOverSlot] = useState<{ hour: number; minute: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const dateString = date.toISOString().split('T')[0];

  // Parse working hours
  const workingStart = parseInt(workingHours.start.split(':')[0]);
  const workingEnd = parseInt(workingHours.end.split(':')[0]);

  // Generate time slots (30-minute increments)
  const timeSlots = useMemo(() => {
    const slots: Array<{ hour: number; minute: number; isWorkingHour: boolean }> = [];
    
    for (let hour = START_HOUR; hour < END_HOUR; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const isWorkingHour = hour >= workingStart && hour < workingEnd;
        slots.push({ hour, minute, isWorkingHour });
      }
    }

    return slots;
  }, [workingStart, workingEnd]);

  // Get scheduled tasks for this day
  const scheduledTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (!task.scheduledStart) return false;
      const startDate = toSafeDate(task.scheduledStart);
      if (!startDate) return false;
      return startDate.toISOString().split('T')[0] === dateString;
    }).map((task) => {
      const startDate = toSafeDate(task.scheduledStart)!;
      const startHour = startDate.getHours();
      const startMinute = startDate.getMinutes();
      const duration = task.estimatedMinutes || 30;
      
      // Calculate position
      const minutesSinceStart = (startHour - START_HOUR) * 60 + startMinute;
      const topOffset = (minutesSinceStart / 30) * SLOT_HEIGHT;
      const height = (duration / 30) * SLOT_HEIGHT - 4; // -4 for visual gap
      
      return { task, topOffset, height };
    });
  }, [tasks, dateString]);

  // Tasks without scheduled start time - ALL unscheduled incomplete tasks
  const unscheduledTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Only show tasks that are NOT scheduled and NOT completed
      if (task.status === 'completed') return false;
      if (task.scheduledStart) return false; // Already scheduled - don't show in sidebar
      
      // Show all unscheduled tasks regardless of due date
      // This includes email-imported tasks without due dates
      return true;
    });
  }, [tasks]);

  // Get scheduled habits for this day (habits with scheduledTime that are due today)
  const scheduledHabits = useMemo(() => {
    const dayOfWeek = date.getDay();
    
    return habits.filter((habit) => {
      // Check if habit has a scheduled time
      if (!habit.scheduledTime) return false;
      
      // Check if habit is due today based on frequency
      if (habit.frequency === 'daily') return true;
      if (habit.frequency === 'weekly' || habit.frequency === 'custom') {
        return habit.daysOfWeek?.includes(dayOfWeek) ?? false;
      }
      return false;
    }).map((habit) => {
      const [hour, minute] = habit.scheduledTime!.split(':').map(Number);
      const duration = habit.estimatedMinutes || 30;
      
      // Calculate position
      const minutesSinceStart = (hour - START_HOUR) * 60 + minute;
      const topOffset = (minutesSinceStart / 30) * SLOT_HEIGHT;
      const height = (duration / 30) * SLOT_HEIGHT - 4;
      
      return { habit, topOffset, height, startHour: hour, startMinute: minute };
    });
  }, [habits, date]);

  // Calculate capacity stats
  const capacityStats = useMemo(() => {
    const totalWorkingMinutes = (workingEnd - workingStart) * 60;
    const scheduledMinutes = scheduledTasks.reduce((sum, { task }) => 
      sum + (task.estimatedMinutes || 30), 0
    );
    
    const utilizationPercent = totalWorkingMinutes > 0 
      ? (scheduledMinutes / totalWorkingMinutes) * 100 
      : 0;
    const isOverbooked = utilizationPercent > 100;
    const isNearCapacity = utilizationPercent > 80;

    return {
      totalWorkingMinutes,
      scheduledMinutes,
      utilizationPercent,
      isOverbooked,
      isNearCapacity,
      availableMinutes: totalWorkingMinutes - scheduledMinutes,
    };
  }, [scheduledTasks, workingStart, workingEnd]);

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as Task;
    if (task) {
      setDraggedTask(task);
    }
  };

  const handleDragOver = (event: any) => {
    const { over } = event;
    if (over?.data?.current) {
      setOverSlot({ hour: over.data.current.hour, minute: over.data.current.minute });
    } else {
      setOverSlot(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { over } = event;
    setOverSlot(null);
    
    if (!over || !draggedTask) {
      setDraggedTask(null);
      return;
    }

    const { hour, minute } = over.data.current as { hour: number; minute: number };
    
    // Calculate new scheduled start time
    const newScheduledStart = new Date(date);
    newScheduledStart.setHours(hour, minute, 0, 0);

    try {
      await onTaskUpdate?.(draggedTask.id, {
        scheduledStart: newScheduledStart,
      });
      console.log(`✅ Scheduled "${draggedTask.title}" at ${formatTime(hour, minute)}`);
    } catch (error) {
      console.error('Failed to schedule task:', error);
    }

    setDraggedTask(null);
  };

  const handleTimeSlotClick = (hour: number, minute: number) => {
    const scheduledStart = new Date(date);
    scheduledStart.setHours(hour, minute, 0, 0);
    onCreateTask?.(scheduledStart);
  };

  // Suggest next task
  const handleSuggestNext = async () => {
    const { suggestNextTask } = await import('@/lib/ai/auto-scheduler');
    const suggestion = await suggestNextTask(unscheduledTasks);
    if (suggestion) {
      setSuggestedTask(suggestion);
    } else {
      alert('No urgent tasks to suggest!');
    }
  };

  // Scroll to current time on mount
  useMemo(() => {
    if (scrollRef.current) {
      const now = new Date();
      if (now.toISOString().split('T')[0] === dateString) {
        const currentHour = now.getHours();
        const slotIndex = Math.max(0, (currentHour - START_HOUR) * 2);
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = slotIndex * SLOT_HEIGHT - 100;
          }
        }, 100);
      }
    }
  }, [dateString]);

  // Calculate total grid height
  const gridHeight = timeSlots.length * SLOT_HEIGHT;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        {/* Header with capacity stats */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold text-text">
              {date.toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric' 
              })}
            </h2>
            <div className="flex items-center gap-4 mt-1 text-sm">
              <span className="text-text-muted">
                📊 {Math.round(capacityStats.scheduledMinutes / 60 * 10) / 10}h / {capacityStats.totalWorkingMinutes / 60}h scheduled
              </span>
              <span className={`font-medium ${
                capacityStats.isOverbooked 
                  ? 'text-red-500' 
                  : capacityStats.isNearCapacity 
                    ? 'text-orange-500' 
                    : 'text-green-500'
              }`}>
                {Math.round(capacityStats.utilizationPercent)}% capacity
              </span>
              {capacityStats.isOverbooked && (
                <span className="text-red-500 font-medium">⚠️ Overbooked</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowUnscheduled(!showUnscheduled)}
            >
              {showUnscheduled ? 'Hide' : 'Show'} Tasks ({unscheduledTasks.length})
            </Button>
            {unscheduledTasks.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSuggestNext}
              >
                💡 Suggest Next
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Unscheduled Tasks Sidebar */}
          {showUnscheduled && unscheduledTasks.length > 0 && (
            <Card variant="bordered" className="lg:col-span-1">
              <div className="p-4">
                <h3 className="font-semibold text-text mb-3">
                  Unscheduled ({unscheduledTasks.length})
                </h3>
                
                {/* Suggested Task Highlight */}
                {suggestedTask && (
                  <div className="mb-4 p-3 rounded-lg border-2 border-primary bg-primary/5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-primary">💡 Suggested</span>
                    </div>
                    <DraggableSidebarTask
                      task={suggestedTask}
                      onClick={() => onTaskClick?.(suggestedTask)}
                      isDragging={draggedTask?.id === suggestedTask.id}
                    />
                  </div>
                )}
                
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {unscheduledTasks
                    .filter(t => t.id !== suggestedTask?.id)
                    .map((task) => (
                      <DraggableSidebarTask
                        key={task.id}
                        task={task}
                        onClick={() => onTaskClick?.(task)}
                        isDragging={draggedTask?.id === task.id}
                      />
                    ))}
                </div>
                <p className="text-xs text-text-muted mt-4">
                  💡 Drag tasks to the calendar to schedule
                </p>
              </div>
            </Card>
          )}

          {/* Time Block Grid */}
          <Card 
            variant="bordered" 
            className={showUnscheduled && unscheduledTasks.length > 0 ? 'lg:col-span-3' : 'lg:col-span-4'}
          >
            <div 
              ref={scrollRef}
              className="max-h-[calc(100vh-300px)] overflow-y-auto"
            >
              {/* Relative container for absolute task positioning */}
              <div className="relative" style={{ height: `${gridHeight}px` }}>
                {/* Time slot rows (background grid) */}
                {timeSlots.map(({ hour, minute, isWorkingHour }) => (
                  <TimeSlotRow
                    key={`${hour}-${minute}`}
                    hour={hour}
                    minute={minute}
                    isWorkingHour={isWorkingHour}
                    isOver={overSlot?.hour === hour && overSlot?.minute === minute}
                    onClick={() => handleTimeSlotClick(hour, minute)}
                  />
                ))}
                
                {/* Scheduled task blocks (absolute positioned overlay) */}
                {scheduledTasks.map(({ task, topOffset, height }) => (
                  <ScheduledTaskBlock
                    key={task.id}
                    task={task}
                    topOffset={topOffset}
                    height={height}
                    onClick={() => onTaskClick?.(task)}
                    isDragging={draggedTask?.id === task.id}
                  />
                ))}
                
                {/* Scheduled habit blocks */}
                {scheduledHabits.map(({ habit, topOffset, height, startHour, startMinute }) => (
                  <div
                    key={habit.id}
                    className="absolute left-16 right-2 rounded-lg shadow-sm border-l-4 p-2 z-10"
                    style={{
                      top: `${topOffset}px`,
                      height: `${Math.max(height, 28)}px`,
                      borderLeftColor: habit.color || '#10b981',
                      backgroundColor: `${habit.color || '#10b981'}20`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{habit.icon || '✨'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text truncate">{habit.title}</p>
                        {height > 40 && (
                          <p className="text-xs text-text-muted">
                            {formatTimeShort(startHour, startMinute)} • {habit.estimatedMinutes || 30}min
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">Habit</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Capacity Legend */}
        <div className="flex items-center gap-6 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded" />
            <span className="text-text-muted">Under 80%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500 rounded" />
            <span className="text-text-muted">80-100%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded" />
            <span className="text-text-muted">Overbooked</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-surface-hover/30 border border-border rounded" />
            <span className="text-text-muted">Non-working hours</span>
          </div>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {draggedTask ? (
          <div className="p-3 rounded-lg border-l-4 border-l-primary bg-surface shadow-xl opacity-95 min-w-[200px]">
            <p className="text-sm font-semibold">{draggedTask.title}</p>
            {draggedTask.estimatedMinutes && (
              <p className="text-xs text-text-muted mt-1">⏱️ {draggedTask.estimatedMinutes}min</p>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
