import { useState, useEffect, useCallback, useMemo } from 'react';
import { TaskList, TaskModal, QuickAddTask, FloatingAddButton, CompletionCelebration } from '@/components/tasks';
import type { Task, Project, Milestone } from '@totalis/shared';
import type { User } from 'firebase/auth';

type FocusMode = 'all' | 'urgent' | 'today' | 'project';

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  
  // Focus mode state
  const [focusMode, setFocusMode] = useState<FocusMode>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  
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

  // Check authentication first
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
            // Redirect to login if not authenticated
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

  // Load tasks only after auth is confirmed
  useEffect(() => {
    if (!authChecked || !user) return;

    let unsubscribeTasks: (() => void) | undefined;
    let unsubscribeProjects: (() => void) | undefined;
    let unsubscribeMilestones: (() => void) | undefined;

    const loadData = async () => {
      try {
        const { subscribeToTasks } = await import('@/lib/db/tasks');
        const { subscribeToProjects } = await import('@/lib/db/projects');
        const { getDb } = await import('@/lib/firebase');
        const { collection, query, onSnapshot } = await import('firebase/firestore');
        
        unsubscribeTasks = subscribeToTasks((updatedTasks) => {
          setTasks(updatedTasks);
          setIsLoading(false);
        });

        unsubscribeProjects = subscribeToProjects(user.uid, (updatedProjects) => {
          setProjects(updatedProjects);
        });

        // Subscribe to milestones
        const milestonesCol = collection(getDb(), 'users', user.uid, 'milestones');
        const milestonesQuery = query(milestonesCol);
        unsubscribeMilestones = onSnapshot(milestonesQuery, (snapshot) => {
          const allMilestones = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Milestone));
          setMilestones(allMilestones);
        });
      } catch (err) {
        console.error('Failed to load tasks:', err);
        setError('Failed to load tasks. Please try again.');
        setIsLoading(false);
      }
    };

    loadData();

    return () => {
      if (unsubscribeTasks) unsubscribeTasks();
      if (unsubscribeProjects) unsubscribeProjects();
      if (unsubscribeMilestones) unsubscribeMilestones();
    };
  }, [authChecked, user]);

  // Create task
  const handleCreateTask = useCallback(async (taskData: Partial<Task>) => {
    try {
      const { createTask } = await import('@/lib/db/tasks');
      await createTask({
        title: taskData.title || '',
        description: taskData.description,
        status: taskData.status || 'pending',
        priority: taskData.priority || 'medium',
        estimatedMinutes: taskData.estimatedMinutes || 30,
        estimatedSource: 'manual',
        dueDate: taskData.dueDate,
        projectId: taskData.projectId,
        blockedBy: [],
        blocking: [],
        reminders: [],
        tags: taskData.tags || [],
      });
    } catch (err) {
      console.error('Failed to create task:', err);
      throw err;
    }
  }, []);

  // Update task
  const handleUpdateTask = useCallback(async (taskData: Partial<Task>) => {
    if (!taskData.id) return;

    try {
      const { updateTask } = await import('@/lib/db/tasks');
      await updateTask(taskData.id, taskData);
    } catch (err) {
      console.error('Failed to update task:', err);
      throw err;
    }
  }, []);

  // Delete task
  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      const { deleteTask } = await import('@/lib/db/tasks');
      await deleteTask(taskId);
    } catch (err) {
      console.error('Failed to delete task:', err);
      throw err;
    }
  }, []);

  // Toggle task completion
  const handleToggleTask = useCallback(async (taskId: string, completed: boolean) => {
    try {
      const { updateTask } = await import('@/lib/db/tasks');
      
      if (completed) {
        await updateTask(taskId, {
          status: 'completed',
          completedAt: new Date(),
        });
        // Show celebration animation
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
  }, []);

  // Open task for editing
  const handleSelectTask = useCallback((task: Task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  }, []);

  // Close modal
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedTask(null);
  }, []);

  // Stats
  const completedToday = tasks.filter((t) => {
    if (!t.completedAt) return false;
    const completed = toSafeDate(t.completedAt);
    if (!completed) return false;
    const today = new Date();
    return (
      completed.getDate() === today.getDate() &&
      completed.getMonth() === today.getMonth() &&
      completed.getFullYear() === today.getFullYear()
    );
  }).length;

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const urgentCount = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'completed').length;
  
  // Filter tasks based on focus mode
  const focusedTasks = useMemo(() => {
    let result = [...tasks];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    switch (focusMode) {
      case 'urgent':
        result = result.filter(t => 
          (t.priority === 'urgent' || t.priority === 'high') && t.status !== 'completed'
        );
        break;
      case 'today':
        result = result.filter(t => {
          if (t.status === 'completed') return false;
          const due = toSafeDate(t.dueDate);
          if (!due) return false;
          return due.getTime() < tomorrow.getTime();
        });
        break;
      case 'project':
        if (selectedProjectId) {
          result = result.filter(t => t.projectId === selectedProjectId);
        }
        break;
    }
    
    return result;
  }, [tasks, focusMode, selectedProjectId]);

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-danger/10 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-text-secondary">{error}</p>
      </div>
    );
  }

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Redirect happens in useEffect, show loading while redirecting
  if (!user) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-text-muted">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Tasks</h1>
          <p className="text-text-muted mt-1">
            {completedToday > 0 && (
              <span className="text-success">{completedToday} completed today • </span>
            )}
            {pendingCount} to do
            {inProgressCount > 0 && `, ${inProgressCount} in progress`}
            {urgentCount > 0 && <span className="text-danger"> • {urgentCount} urgent</span>}
          </p>
        </div>
      </div>

      {/* Focus Mode Tabs */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => setFocusMode('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              focusMode === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-text-secondary'
            }`}
          >
            📋 All Tasks
            <span className="ml-2 text-xs opacity-75">({tasks.filter(t => t.status !== 'completed').length})</span>
          </button>
          
          <button
            onClick={() => setFocusMode('urgent')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              focusMode === 'urgent'
                ? 'bg-red-500 text-white shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-text-secondary'
            }`}
          >
            🔥 Urgent & High
            {urgentCount > 0 && <span className="ml-2 text-xs opacity-75">({urgentCount})</span>}
          </button>
          
          <button
            onClick={() => setFocusMode('today')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              focusMode === 'today'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-text-secondary'
            }`}
          >
            📅 Due Today
          </button>
          
          <button
            onClick={() => {
              setFocusMode('project');
              if (!selectedProjectId && projects.length > 0) {
                setSelectedProjectId(projects[0].id);
              }
            }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              focusMode === 'project'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-text-secondary'
            }`}
          >
            📁 By Project
          </button>
        </div>

        {/* Project Selector (when in project mode) */}
        {focusMode === 'project' && (
          <div className="flex flex-wrap gap-2 p-3 bg-surface rounded-xl border border-border">
            {projects.length === 0 ? (
              <p className="text-sm text-text-muted">No projects yet. Create a project first.</p>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedProjectId === project.id
                      ? 'bg-primary/20 text-primary ring-1 ring-primary/50'
                      : 'bg-background hover:bg-surface-hover text-text-secondary'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: project.color || '#6366f1' }}
                  />
                  {project.title}
                  <span className="text-xs opacity-60">
                    ({tasks.filter(t => t.projectId === project.id && t.status !== 'completed').length})
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Focus mode description */}
        {focusMode !== 'all' && (
          <div className="mt-3 text-sm text-text-secondary">
            {focusMode === 'urgent' && '🎯 Focus on your most important tasks first'}
            {focusMode === 'today' && '⏰ Tasks that need attention today or are overdue'}
            {focusMode === 'project' && selectedProjectId && (
              <>📌 Showing tasks from: <span className="font-medium text-text">{projects.find(p => p.id === selectedProjectId)?.title}</span></>
            )}
          </div>
        )}
      </div>

      {/* Quick Add */}
      <div className="mb-6">
        <QuickAddTask onAdd={handleCreateTask} />
      </div>

      {/* Task List */}
      <TaskList
        tasks={focusedTasks}
        projects={projects}
        onToggleTask={handleToggleTask}
        onSelectTask={handleSelectTask}
        isLoading={isLoading}
        emptyMessage={
          focusMode === 'urgent' 
            ? "No urgent tasks! You're on top of things 🎉"
            : focusMode === 'today'
              ? "Nothing due today! Plan ahead or enjoy the calm 🌴"
              : focusMode === 'project' && !selectedProjectId
                ? "Select a project to see its tasks"
                : "You're all caught up! Add a task to get started."
        }
      />

      {/* Floating Add Button */}
      <FloatingAddButton onAdd={handleCreateTask} />

      {/* Task Edit Modal */}
      <TaskModal
        task={selectedTask}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={selectedTask ? handleUpdateTask : handleCreateTask}
        onDelete={handleDeleteTask}
        projects={projects}
        milestones={milestones}
        mode={selectedTask ? 'edit' : 'create'}
      />

      {/* Completion Celebration */}
      <CompletionCelebration
        isActive={showCelebration}
        onComplete={() => setShowCelebration(false)}
      />
    </div>
  );
}
