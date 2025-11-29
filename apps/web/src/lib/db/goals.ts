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
import type { Goal } from '@totalis/shared';

// Helper to remove undefined values from an object
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

const getGoalsCollection = (userId: string) => {
  const db = getDb();
  return collection(db, 'users', userId, 'goals');
};

export async function createGoal(
  goal: Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const goalsCol = getGoalsCollection(userId);
  const now = Timestamp.now();

  const cleanGoal = removeUndefined(goal);

  const docRef = await addDoc(goalsCol, {
    ...cleanGoal,
    userId,
    progress: 0,
    createdAt: now,
    updatedAt: now,
  });

  return docRef.id;
}

export async function updateGoal(
  goalId: string,
  updates: Partial<Goal>
): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const goalRef = doc(getDb(), 'users', userId, 'goals', goalId);
  const cleanUpdates = removeUndefined(updates);

  await updateDoc(goalRef, {
    ...cleanUpdates,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteGoal(goalId: string): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const goalRef = doc(getDb(), 'users', userId, 'goals', goalId);
  await deleteDoc(goalRef);
}

export async function getGoal(goalId: string): Promise<Goal | null> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const goalRef = doc(getDb(), 'users', userId, 'goals', goalId);
  const snapshot = await getDoc(goalRef);

  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Goal;
}

export async function getGoals(filters?: {
  status?: Goal['status'];
}): Promise<Goal[]> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const goalsCol = getGoalsCollection(userId);
  let q = query(goalsCol, orderBy('createdAt', 'desc'));

  if (filters?.status) {
    q = query(q, where('status', '==', filters.status));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Goal));
}

export function subscribeToGoals(
  userId: string,
  callback: (goals: Goal[]) => void,
  filters?: { status?: Goal['status'] }
): Unsubscribe {
  const goalsCol = getGoalsCollection(userId);
  let q = query(goalsCol, orderBy('createdAt', 'desc'));

  if (filters?.status) {
    q = query(q, where('status', '==', filters.status));
  }

  return onSnapshot(q, (snapshot) => {
    const goals = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as Goal));
    callback(goals);
  });
}

export async function archiveGoal(goalId: string): Promise<void> {
  await updateGoal(goalId, { status: 'archived' });
}

export async function completeGoal(goalId: string): Promise<void> {
  await updateGoal(goalId, { 
    status: 'completed',
    progress: 100,
  });
}
