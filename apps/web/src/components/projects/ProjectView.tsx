/**
 * ProjectView Component
 * Full-page immersive view for a single project with milestones and tasks
 */

import { useState, useEffect } from 'react';
import { Button, Badge, Card, CardContent, Input, Textarea } from '@/components/ui';
import { MilestoneCard } from './MilestoneCard';
import { TaskModal } from '@/components/tasks/TaskModal';
import type { Project, Milestone, Task, Goal } from '@totalis/shared';

interface ProjectViewProps {
  project: Project;
  onClose: () => void;
  onSave: (project: Partial<Project>) => Promise<void>;
  onDelete: (projectId: string) => Promise<void>;
  goals?: Goal[];
}

const statusConfig = {
  active: { color: 'bg-green-500', label: 'Active', textColor: 'text-green-400' },
  completed: { color: 'bg-blue-500', label: 'Completed', textColor: 'text-blue-400' },
  archived: { color: 'bg-gray-500', label: 'Archived', textColor: 'text-gray-400' },
  blocked: { color: 'bg-red-500', label: 'Blocked', textColor: 'text-red-400' },
} as const;

const colorOptions = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

export function ProjectView({ 
  project, 
  onClose, 
  onSave, 
  onDelete, 
  goals = [] 
}: ProjectViewProps) {
  const [activeSection, setActiveSection] = useState<'overview' | 'milestones' | 'tasks' | 'settings'>('overview');
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(new Set());
  
  // Task modal state (local to ProjectView)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  
  // Edit mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(project.title);
  const [editDescription, setEditDescription] = useState(project.description || '');
  const [editStatus, setEditStatus] = useState(project.status);
  const [editColor, setEditColor] = useState(project.color || colorOptions[0]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load milestones and tasks
  useEffect(() => {
    let unsubMilestones: (() => void) | undefined;
    let unsubTasks: (() => void) | undefined;

    const loadData = async () => {
      try {
        const { subscribeToMilestones } = await import('@/lib/db/milestones');
        const { subscribeToTasks } = await import('@/lib/db/tasks');

        unsubMilestones = subscribeToMilestones(project.id, (updatedMilestones) => {
          setMilestones(updatedMilestones.sort((a, b) => a.order - b.order));
          setLoading(false);
          
          // Auto-expand first incomplete milestone
          const firstIncomplete = updatedMilestones.find(m => m.status !== 'completed');
          if (firstIncomplete && expandedMilestones.size === 0) {
            setExpandedMilestones(new Set([firstIncomplete.id]));
          }
        });

        unsubTasks = subscribeToTasks((updatedTasks) => {
          setTasks(updatedTasks.filter((t) => t.projectId === project.id));
        }, { projectId: project.id });
      } catch (error) {
        console.error('Failed to load project data:', error);
        setLoading(false);
      }
    };

    loadData();

    return () => {
      unsubMilestones?.();
      unsubTasks?.();
    };
  }, [project.id]);

  // Reset edit states when project changes
  useEffect(() => {
    setEditTitle(project.title);
    setEditDescription(project.description || '');
    setEditStatus(project.status);
    setEditColor(project.color || colorOptions[0]);
  }, [project]);

  const toggleMilestone = (milestoneId: string) => {
    setExpandedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  };

  const expandAll = () => setExpandedMilestones(new Set(milestones.map(m => m.id)));
  const collapseAll = () => setExpandedMilestones(new Set());

  // Task handlers
  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  const handleToggleTaskComplete = async (task: Task) => {
    try {
      const { updateTask } = await import('@/lib/db/tasks');
      await updateTask(task.id, {
        status: task.status === 'completed' ? 'pending' : 'completed',
        completedAt: task.status === 'completed' ? undefined : new Date(),
      });
    } catch (error) {
      console.error('Failed to toggle task:', error);
    }
  };

  const handleSaveTask = async (taskData: Partial<Task>) => {
    try {
      const { updateTask } = await import('@/lib/db/tasks');
      if (taskData.id) {
        await updateTask(taskData.id, taskData);
      }
    } catch (error) {
      console.error('Failed to save task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const { deleteTask } = await import('@/lib/db/tasks');
      await deleteTask(taskId);
      setIsTaskModalOpen(false);
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      await onSave({
        id: project.id,
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        status: editStatus,
        color: editColor,
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(project.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const status = statusConfig[project.status];
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const progressPercentage = tasks.length > 0 
    ? Math.round((completedTasks / tasks.length) * 100) 
    : project.progress;

  // Calculate total estimated hours
  const totalEstimatedHours = milestones.reduce((sum, m) => sum + (m.estimatedHours || 0), 0);
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;

  // Calculate remaining hours (from incomplete tasks)
  const completedHours = tasks
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + ((t.estimatedMinutes || 0) / 60), 0);
  const totalTaskHours = tasks.reduce((sum, t) => sum + ((t.estimatedMinutes || 0) / 60), 0);
  const remainingHours = Math.round((totalTaskHours - completedHours) * 10) / 10;

  // Safe date conversion helper
  const toSafeDate = (value: unknown): Date | null => {
    if (!value) return null;
    try {
      if (typeof value === 'object' && 'toDate' in value) {
        return (value as any).toDate();
      }
      const date = new Date(value as string | number);
      if (isNaN(date.getTime())) return null;
      return date;
    } catch {
      return null;
    }
  };

  // Calculate days left
  const deadlineDate = toSafeDate(project.deadline);
  const daysLeft = deadlineDate 
    ? Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden flex flex-col">
      {/* Header Bar */}
      <header className="flex-shrink-0 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Back button and title */}
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="p-2 -ml-2 text-text-secondary hover:text-text hover:bg-surface-hover rounded-lg transition-colors"
                title="Back to Projects"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
              </button>
              
              <div className="flex items-center gap-3">
                <div 
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: project.color || '#6366f1' }}
                />
                <h1 className="text-xl font-bold text-text truncate max-w-md">
                  {project.title}
                </h1>
                <Badge className={`${status.color} text-white`}>
                  {status.label}
                </Badge>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {!isEditing ? (
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit
                </Button>
              ) : (
                <>
                  <Button 
                    variant="secondary" 
                    size="sm"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    size="sm"
                    onClick={handleSaveChanges}
                    isLoading={isSaving}
                  >
                    Save Changes
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="flex-shrink-0 border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {(['overview', 'milestones', 'tasks', 'settings'] as const).map((section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeSection === section
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:text-text hover:border-border'
                }`}
              >
                {section === 'overview' && 'Overview'}
                {section === 'milestones' && `Milestones (${milestones.length})`}
                {section === 'tasks' && `All Tasks (${tasks.length})`}
                {section === 'settings' && 'Settings'}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          
          {/* Overview Section */}
          {activeSection === 'overview' && (
            <div className="space-y-6">
              {/* Progress Hero */}
              <Card className="bg-gradient-to-br from-surface to-surface-hover border-border">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    <div className="flex-1">
                      {isEditing ? (
                        <div className="space-y-4">
                          <Input
                            label="Project Title"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="text-xl font-bold"
                          />
                          <Textarea
                            label="Description"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            rows={3}
                          />
                        </div>
                      ) : (
                        <>
                          <h2 className="text-2xl font-bold text-text mb-2">{project.title}</h2>
                          {project.description && (
                            <p className="text-text-secondary">{project.description}</p>
                          )}
                        </>
                      )}
                    </div>

                    {/* Big Progress Circle */}
                    <div className="flex-shrink-0 flex flex-col items-center">
                      <div className="relative w-32 h-32">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="currentColor"
                            strokeWidth="12"
                            fill="none"
                            className="text-surface-hover"
                          />
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="currentColor"
                            strokeWidth="12"
                            fill="none"
                            strokeDasharray={`${progressPercentage * 3.52} 352`}
                            strokeLinecap="round"
                            className="text-primary transition-all duration-500"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-3xl font-bold text-text">{progressPercentage}%</span>
                        </div>
                      </div>
                      <span className="text-sm text-text-secondary mt-2">Complete</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-3xl font-bold text-text">{milestones.length}</div>
                    <div className="text-sm text-text-secondary">Milestones</div>
                    <div className="text-xs text-green-500 mt-1">{completedMilestones} completed</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-3xl font-bold text-text">{tasks.length}</div>
                    <div className="text-sm text-text-secondary">Tasks</div>
                    <div className="text-xs text-green-500 mt-1">{completedTasks} completed</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-3xl font-bold text-text">{totalEstimatedHours}h</div>
                    <div className="text-sm text-text-secondary">Total Hours</div>
                    <div className="text-xs text-text-muted mt-1">estimated</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className={`text-3xl font-bold ${remainingHours > 0 ? 'text-orange-400' : 'text-green-500'}`}>
                      {remainingHours}h
                    </div>
                    <div className="text-sm text-text-secondary">Remaining</div>
                    <div className="text-xs text-text-muted mt-1">hours left</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className={`text-3xl font-bold ${
                      daysLeft === null ? 'text-text' :
                      daysLeft < 0 ? 'text-red-500' :
                      daysLeft <= 3 ? 'text-orange-400' : 'text-text'
                    }`}>
                      {daysLeft !== null ? (daysLeft < 0 ? 'Overdue' : daysLeft) : '—'}
                    </div>
                    <div className="text-sm text-text-secondary">Days Left</div>
                    {deadlineDate && (
                      <div className="text-xs text-text-muted mt-1">
                        {deadlineDate.toLocaleDateString()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Current Focus - Next Milestone */}
              {milestones.length > 0 && (() => {
                const currentMilestone = milestones.find(m => m.status !== 'completed') || milestones[0];
                const milestoneTasks = tasks.filter(t => t.milestoneId === currentMilestone.id);
                return (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
                        Current Focus
                      </h3>
                      <MilestoneCard
                        milestone={currentMilestone}
                        tasks={milestoneTasks}
                        isExpanded={true}
                        onTaskClick={handleTaskClick}
                        onToggleTaskComplete={handleToggleTaskComplete}
                      />
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}

          {/* Milestones Section */}
          {activeSection === 'milestones' && (
            <div className="space-y-4">
              {/* Controls */}
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-text">
                  Project Milestones
                </h2>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={expandAll}>
                    Expand All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={collapseAll}>
                    Collapse All
                  </Button>
                </div>
              </div>

              {/* Timeline View */}
              {loading ? (
                <div className="space-y-4 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-surface rounded-xl p-6 h-32" />
                  ))}
                </div>
              ) : milestones.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-hover flex items-center justify-center">
                      <svg className="w-8 h-8 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-text mb-2">No Milestones</h3>
                    <p className="text-text-secondary">
                      Use AI Quick Capture (Ctrl+K) to generate a structured project with milestones and tasks.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
                  
                  <div className="space-y-4">
                    {milestones.map((milestone, index) => {
                      const milestoneTasks = tasks.filter((t) => t.milestoneId === milestone.id);
                      const isCompleted = milestone.status === 'completed';
                      const isCurrent = !isCompleted && (index === 0 || milestones[index - 1].status === 'completed');

                      return (
                        <div key={milestone.id} className="relative pl-14">
                          {/* Timeline dot */}
                          <div className={`absolute left-4 top-5 w-5 h-5 rounded-full border-4 ${
                            isCompleted 
                              ? 'bg-green-500 border-green-500/30' 
                              : isCurrent
                                ? 'bg-primary border-primary/30 animate-pulse'
                                : 'bg-surface border-border'
                          }`} />

                          <MilestoneCard
                            milestone={milestone}
                            tasks={milestoneTasks}
                            isExpanded={expandedMilestones.has(milestone.id)}
                            onToggleExpand={() => toggleMilestone(milestone.id)}
                            onTaskClick={handleTaskClick}
                            onToggleTaskComplete={handleToggleTaskComplete}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tasks Section */}
          {activeSection === 'tasks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-text">All Project Tasks</h2>
                <div className="text-sm text-text-secondary">
                  {completedTasks} of {tasks.length} completed
                </div>
              </div>

              {tasks.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <p className="text-text-secondary">No tasks in this project yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => {
                    const milestone = milestones.find(m => m.id === task.milestoneId);
                    const handleCheckboxClick = async (e: React.MouseEvent) => {
                      e.stopPropagation();
                      const { updateTask } = await import('@/lib/db/tasks');
                      await updateTask(task.id, {
                        status: task.status === 'completed' ? 'pending' : 'completed',
                        completedAt: task.status === 'completed' ? undefined : new Date(),
                      });
                    };
                    
                    return (
                      <Card 
                        key={task.id} 
                        className={`hover:border-primary/50 transition-colors cursor-pointer ${
                          task.status === 'completed' ? 'opacity-60' : ''
                        }`}
                        onClick={() => handleTaskClick(task)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            {/* Clickable Checkbox */}
                            <button
                              type="button"
                              onClick={handleCheckboxClick}
                              className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                                task.status === 'completed'
                                  ? 'bg-green-500 border-green-500'
                                  : 'border-border hover:border-primary'
                              }`}
                            >
                              {task.status === 'completed' && (
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>

                            {/* Task content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-medium ${
                                  task.status === 'completed' ? 'line-through text-text-secondary' : 'text-text'
                                }`}>
                                  {task.title}
                                </span>
                                {task.priority === 'urgent' && (
                                  <Badge className="bg-red-500/20 text-red-400 text-xs">Urgent</Badge>
                                )}
                                {task.priority === 'high' && (
                                  <Badge className="bg-orange-500/20 text-orange-400 text-xs">High</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                                {milestone && (
                                  <span className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
                                    {milestone.title}
                                  </span>
                                )}
                                {task.dueDate && (
                                  <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                                )}
                                {task.estimatedMinutes && (
                                  <span>{Math.round(task.estimatedMinutes / 60 * 10) / 10}h</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Settings Section */}
          {activeSection === 'settings' && (
            <div className="max-w-2xl space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-text mb-4">Project Settings</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text mb-2">Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as Project['status'])}
                        className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="blocked">Blocked</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text mb-2">Color</label>
                      <div className="flex gap-2 flex-wrap">
                        {colorOptions.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={`w-8 h-8 rounded-lg transition-all ${
                              editColor === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-primary scale-110' : 'hover:scale-105'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    <Button onClick={handleSaveChanges} isLoading={isSaving}>
                      Save Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Danger Zone */}
              <Card className="border-red-500/30">
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-danger mb-4">Danger Zone</h3>
                  
                  {!showDeleteConfirm ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-text font-medium">Delete Project</p>
                        <p className="text-sm text-text-secondary">
                          Permanently delete this project and all its milestones and tasks.
                        </p>
                      </div>
                      <Button 
                        variant="danger" 
                        onClick={() => setShowDeleteConfirm(true)}
                      >
                        Delete Project
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4 bg-danger/10 border border-danger/20 rounded-lg">
                      <div className="flex items-start gap-3 mb-4">
                        <svg className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                          <p className="text-sm font-semibold text-danger mb-2">
                            Are you absolutely sure?
                          </p>
                          <p className="text-sm text-text-secondary mb-2">This will permanently delete:</p>
                          <ul className="text-sm text-text-secondary space-y-1 ml-4 list-disc">
                            <li>Project: <span className="font-medium text-text">{project.title}</span></li>
                            <li><span className="font-medium text-text">{milestones.length}</span> milestones</li>
                            <li><span className="font-medium text-text">{tasks.length}</span> tasks</li>
                          </ul>
                          <p className="text-sm text-danger font-medium mt-3">⚠️ This action cannot be undone!</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="danger"
                          onClick={handleDelete}
                          isLoading={isDeleting}
                        >
                          Yes, Delete Everything
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setShowDeleteConfirm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Task Modal */}
      <TaskModal
        task={selectedTask}
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        projects={[project]}
        milestones={milestones}
        mode={selectedTask ? 'edit' : 'create'}
      />
    </div>
  );
}
