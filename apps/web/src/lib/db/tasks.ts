import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb, getAuthInstance } from '../firebase';
import type { Task } from '@totalis/shared';

const getTasksCollection = (userId: string) => {
  const db = getDb();
  return collection(db, 'users', userId, 'tasks');
};

// Helper to remove undefined values from an object
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

export async function createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'syncStatus'>): Promise<string> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const tasksCol = getTasksCollection(userId);
  const now = Timestamp.now();

  // Remove undefined values - Firestore doesn't accept them
  const cleanTask = removeUndefined(task);

  const docRef = await addDoc(tasksCol, {
    ...cleanTask,
    userId,
    syncStatus: 'synced',
    createdAt: now,
    updatedAt: now,
  });

  return docRef.id;
}

export async function updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const taskRef = doc(getDb(), 'users', userId, 'tasks', taskId);
  
  // Get the task first to check if status is changing and get milestoneId
  const taskSnapshot = await getDoc(taskRef);
  const currentTask = taskSnapshot.exists() ? { id: taskSnapshot.id, ...taskSnapshot.data() } as Task : null;
  
  // Remove undefined values - Firestore doesn't accept them
  const cleanUpdates = removeUndefined(updates);
  
  await updateDoc(taskRef, {
    ...cleanUpdates,
    updatedAt: Timestamp.now(),
  });

  // Recalculate milestone progress if task has a milestone and status changed
  if (currentTask?.milestoneId && updates.status !== undefined) {
    const { recalculateMilestoneProgress } = await import('./milestones');
    await recalculateMilestoneProgress(currentTask.milestoneId);
  }
}

export async function deleteTask(taskId: string): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const taskRef = doc(getDb(), 'users', userId, 'tasks', taskId);
  await deleteDoc(taskRef);
}

export async function getTask(taskId: string): Promise<Task | null> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const taskRef = doc(getDb(), 'users', userId, 'tasks', taskId);
  const snapshot = await getDoc(taskRef);

  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Task;
}

export async function getTasks(filters?: {
  status?: Task['status'];
  projectId?: string;
  milestoneId?: string;
  dueDate?: Date;
}): Promise<Task[]> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const tasksCol = getTasksCollection(userId);
  let q = query(tasksCol, orderBy('createdAt', 'desc'));

  if (filters?.status) {
    q = query(q, where('status', '==', filters.status));
  }
  if (filters?.projectId) {
    q = query(q, where('projectId', '==', filters.projectId));
  }
  if (filters?.milestoneId) {
    q = query(q, where('milestoneId', '==', filters.milestoneId));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Task));
}

export function subscribeToTasks(
  callback: (tasks: Task[]) => void,
  filters?: { status?: Task['status']; projectId?: string; milestoneId?: string }
): Unsubscribe {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const tasksCol = getTasksCollection(userId);
  let q = query(tasksCol, orderBy('createdAt', 'desc'));

  if (filters?.status) {
    q = query(q, where('status', '==', filters.status));
  }
  if (filters?.projectId) {
    q = query(q, where('projectId', '==', filters.projectId));
  }
  if (filters?.milestoneId) {
    q = query(q, where('milestoneId', '==', filters.milestoneId));
  }

  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Task));
    callback(tasks);
  });
}

export async function getTodayTasks(): Promise<Task[]> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const tasksCol = getTasksCollection(userId);
  const q = query(
    tasksCol,
    where('scheduledStart', '>=', Timestamp.fromDate(today)),
    where('scheduledStart', '<', Timestamp.fromDate(tomorrow)),
    orderBy('scheduledStart', 'asc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Task));
}

export async function completeTask(taskId: string): Promise<void> {
  await updateTask(taskId, {
    status: 'completed',
    completedAt: new Date(),
  });

  // Recalculate milestone progress if task belongs to a milestone
  const task = await getTask(taskId);
  if (task?.milestoneId) {
    const { recalculateMilestoneProgress } = await import('./milestones');
    await recalculateMilestoneProgress(task.milestoneId);
  }
}
