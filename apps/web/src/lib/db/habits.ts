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
import type { Habit } from '@totalis/shared';

// Helper to remove undefined values from an object
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

const getHabitsCollection = (userId: string) => {
  const db = getDb();
  return collection(db, 'users', userId, 'habits');
};

export async function createHabit(
  habit: Omit<Habit, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'currentStreak' | 'longestStreak' | 'totalCompletions'>
): Promise<string> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const habitsCol = getHabitsCollection(userId);
  const now = Timestamp.now();

  const cleanHabit = removeUndefined(habit);

  const docRef = await addDoc(habitsCol, {
    ...cleanHabit,
    userId,
    currentStreak: 0,
    longestStreak: 0,
    totalCompletions: 0,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  });

  return docRef.id;
}

export async function updateHabit(
  habitId: string,
  updates: Partial<Habit>
): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const habitRef = doc(getDb(), 'users', userId, 'habits', habitId);
  const cleanUpdates = removeUndefined(updates);

  await updateDoc(habitRef, {
    ...cleanUpdates,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteHabit(habitId: string): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const habitRef = doc(getDb(), 'users', userId, 'habits', habitId);
  await deleteDoc(habitRef);
}

export async function getHabit(habitId: string): Promise<Habit | null> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const habitRef = doc(getDb(), 'users', userId, 'habits', habitId);
  const snapshot = await getDoc(habitRef);

  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Habit;
}

export async function getHabits(filters?: {
  isArchived?: boolean;
}): Promise<Habit[]> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const habitsCol = getHabitsCollection(userId);
  let q = query(habitsCol, orderBy('createdAt', 'desc'));

  if (filters?.isArchived !== undefined) {
    q = query(q, where('isArchived', '==', filters.isArchived));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Habit));
}

export function subscribeToHabits(
  userId: string,
  callback: (habits: Habit[]) => void,
  filters?: { isArchived?: boolean }
): Unsubscribe {
  const habitsCol = getHabitsCollection(userId);
  let q = query(habitsCol, orderBy('createdAt', 'desc'));

  if (filters?.isArchived !== undefined) {
    q = query(q, where('isArchived', '==', filters.isArchived));
  }

  return onSnapshot(q, (snapshot) => {
    const habits = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as Habit));
    callback(habits);
  });
}

export async function archiveHabit(habitId: string): Promise<void> {
  await updateHabit(habitId, { isArchived: true });
}

export async function unarchiveHabit(habitId: string): Promise<void> {
  await updateHabit(habitId, { isArchived: false });
}

export async function updateStreaks(
  habitId: string,
  isCompleted: boolean
): Promise<void> {
  const habit = await getHabit(habitId);
  if (!habit) return;

  let { currentStreak, longestStreak, totalCompletions } = habit;

  if (isCompleted) {
    currentStreak += 1;
    totalCompletions += 1;
    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
    }
  } else {
    // Reset streak if not completed (could be called to break streak)
    currentStreak = 0;
  }

  await updateHabit(habitId, {
    currentStreak,
    longestStreak,
    totalCompletions,
  });
}
