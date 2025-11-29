import { useState, useEffect, useCallback } from 'react';
import { TaskList, TaskModal, QuickAddTask, FloatingAddButton, CompletionCelebration } from '@/components/tasks';
import type { Task } from '@totalis/shared';
import type { User } from 'firebase/auth';

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

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

    let unsubscribe: (() => void) | undefined;

    const loadTasks = async () => {
      try {
        const { subscribeToTasks } = await import('@/lib/db/tasks');
        
        unsubscribe = subscribeToTasks((updatedTasks) => {
          setTasks(updatedTasks);
          setIsLoading(false);
        });
      } catch (err) {
        console.error('Failed to load tasks:', err);
        setError('Failed to load tasks. Please try again.');
        setIsLoading(false);
      }
    };

    loadTasks();

    return () => {
      if (unsubscribe) unsubscribe();
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
    const completed = new Date(t.completedAt);
    const today = new Date();
    return (
      completed.getDate() === today.getDate() &&
      completed.getMonth() === today.getMonth() &&
      completed.getFullYear() === today.getFullYear()
    );
  }).length;

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;

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
    <div className="p-6 max-w-4xl mx-auto">
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
          </p>
        </div>
        <FloatingAddButton onAdd={handleCreateTask} />
      </div>

      {/* Quick Add */}
      <div className="mb-6">
        <QuickAddTask onAdd={handleCreateTask} />
      </div>

      {/* Task List */}
      <TaskList
        tasks={tasks}
        onToggleTask={handleToggleTask}
        onSelectTask={handleSelectTask}
        isLoading={isLoading}
        emptyMessage="You're all caught up! Add a task to get started."
      />

      {/* Task Edit Modal */}
      <TaskModal
        task={selectedTask}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={selectedTask ? handleUpdateTask : handleCreateTask}
        onDelete={handleDeleteTask}
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
