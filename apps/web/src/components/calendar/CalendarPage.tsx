import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAuthInstance } from '@/lib/firebase';
import { subscribeToTasks } from '@/lib/db/tasks';
import { subscribeToHabits } from '@/lib/db/habits';
import { CalendarView } from './CalendarView';
import { TaskModal } from '@/components/tasks/TaskModal';
import type { Task, Habit, HabitLog } from '@totalis/shared';

export function CalendarPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Auth state listener
  useEffect(() => {
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to tasks and habits
  useEffect(() => {
    if (!authChecked || !user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const unsubTasks = subscribeToTasks((updatedTasks) => {
      setTasks(updatedTasks);
      setIsLoading(false);
    });

    const unsubHabits = subscribeToHabits(user.uid, (updatedHabits) => {
      setHabits(updatedHabits.filter((h) => !h.isArchived));
    });

    // TODO: Load habit logs for visible date range
    // For now, we'll just use empty array

    return () => {
      unsubTasks();
      unsubHabits();
    };
  }, [user, authChecked]);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleUpdateTask = async (taskData: Partial<Task>) => {
    if (!taskData.id) return;

    const { updateTask } = await import('@/lib/db/tasks');
    await updateTask(taskData.id, taskData);
  };

  const handleDeleteTask = async (taskId: string) => {
    const { deleteTask } = await import('@/lib/db/tasks');
    await deleteTask(taskId);
  };

  // Show login prompt if not authenticated
  if (authChecked && !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-surface flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-text mb-2">Sign in to view calendar</h2>
          <p className="text-text-secondary mb-6">
            See your tasks and habits at a glance
          </p>
          <a
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 font-medium rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-surface-hover rounded" />
          <div className="h-10 w-32 bg-surface-hover rounded" />
        </div>
        <div className="bg-surface-hover rounded-xl h-[500px]" />
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-text mb-2">Calendar</h1>
        <p className="text-text-secondary">
          View your tasks and habits at a glance
        </p>
      </div>

      {/* Calendar */}
      <CalendarView
        tasks={tasks}
        habits={habits}
        habitLogs={habitLogs}
        onTaskClick={handleTaskClick}
      />

      {/* Task Modal */}
      <TaskModal
        task={selectedTask}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTask(null);
        }}
        onSave={handleUpdateTask}
        onDelete={handleDeleteTask}
        mode="edit"
      />
    </div>
  );
}
