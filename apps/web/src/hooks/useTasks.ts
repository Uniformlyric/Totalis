import { useState, useEffect, useCallback } from 'react';
import { subscribeToTasks, createTask, updateTask, deleteTask, completeTask } from '@/lib/db/tasks';
import type { Task } from '@totalis/shared';

export function useTasks(filters?: { status?: Task['status']; projectId?: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    try {
      const unsubscribe = subscribeToTasks((newTasks) => {
        setTasks(newTasks);
        setLoading(false);
      }, filters);
      return unsubscribe;
    } catch (err) {
      setError(err as Error);
      setLoading(false);
    }
  }, [filters?.status, filters?.projectId]);

  const addTask = useCallback(async (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    return createTask(task);
  }, []);

  const editTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    return updateTask(taskId, updates);
  }, []);

  const removeTask = useCallback(async (taskId: string) => {
    return deleteTask(taskId);
  }, []);

  const markComplete = useCallback(async (taskId: string) => {
    return completeTask(taskId);
  }, []);

  return {
    tasks,
    loading,
    error,
    addTask,
    editTask,
    removeTask,
    markComplete,
  };
}
