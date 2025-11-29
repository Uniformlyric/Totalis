import { create } from 'zustand';
import type { Task } from '@totalis/shared';

interface TaskState {
  tasks: Task[];
  selectedTask: Task | null;
  isTaskModalOpen: boolean;
  filter: {
    status: Task['status'] | 'all';
    projectId: string | null;
    priority: Task['priority'] | 'all';
  };
  
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;
  
  selectTask: (task: Task | null) => void;
  openTaskModal: (task?: Task) => void;
  closeTaskModal: () => void;
  
  setFilter: (filter: Partial<TaskState['filter']>) => void;
  clearFilters: () => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  selectedTask: null,
  isTaskModalOpen: false,
  filter: {
    status: 'all',
    projectId: null,
    priority: 'all',
  },
  
  setTasks: (tasks) => set({ tasks }),
  
  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
  
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      selectedTask:
        state.selectedTask?.id === id
          ? { ...state.selectedTask, ...updates }
          : state.selectedTask,
    })),
  
  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      selectedTask: state.selectedTask?.id === id ? null : state.selectedTask,
    })),
  
  selectTask: (task) => set({ selectedTask: task }),
  
  openTaskModal: (task) => set({ isTaskModalOpen: true, selectedTask: task || null }),
  
  closeTaskModal: () => set({ isTaskModalOpen: false, selectedTask: null }),
  
  setFilter: (filter) =>
    set((state) => ({ filter: { ...state.filter, ...filter } })),
  
  clearFilters: () =>
    set({ filter: { status: 'all', projectId: null, priority: 'all' } }),
}));

// Selectors
export const selectFilteredTasks = (state: TaskState) => {
  let filtered = state.tasks;
  
  if (state.filter.status !== 'all') {
    filtered = filtered.filter((t) => t.status === state.filter.status);
  }
  
  if (state.filter.projectId) {
    filtered = filtered.filter((t) => t.projectId === state.filter.projectId);
  }
  
  if (state.filter.priority !== 'all') {
    filtered = filtered.filter((t) => t.priority === state.filter.priority);
  }
  
  return filtered;
};

export const selectTodayTasks = (state: TaskState) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return state.tasks.filter((t) => {
    if (!t.scheduledStart) return false;
    const scheduled = new Date(t.scheduledStart);
    return scheduled >= today && scheduled < tomorrow;
  });
};

export const selectPendingTasks = (state: TaskState) =>
  state.tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');

export const selectCompletedTasks = (state: TaskState) =>
  state.tasks.filter((t) => t.status === 'completed');
