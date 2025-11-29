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
import type { HabitLog } from '@totalis/shared';

const getHabitLogsCollection = (userId: string) => {
  const db = getDb();
  return collection(db, 'users', userId, 'habitLogs');
};

// Get date string in format YYYY-MM-DD
export function getDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

export async function createHabitLog(
  log: Omit<HabitLog, 'id' | 'userId' | 'createdAt'>
): Promise<string> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const logsCol = getHabitLogsCollection(userId);
  const now = Timestamp.now();

  const docRef = await addDoc(logsCol, {
    ...log,
    userId,
    createdAt: now,
  });

  return docRef.id;
}

export async function updateHabitLog(
  logId: string,
  updates: Partial<HabitLog>
): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const logRef = doc(getDb(), 'users', userId, 'habitLogs', logId);
  await updateDoc(logRef, updates);
}

export async function deleteHabitLog(logId: string): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const logRef = doc(getDb(), 'users', userId, 'habitLogs', logId);
  await deleteDoc(logRef);
}

export async function getHabitLogForDate(
  habitId: string,
  date: string
): Promise<HabitLog | null> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const logsCol = getHabitLogsCollection(userId);
  const q = query(
    logsCol,
    where('habitId', '==', habitId),
    where('date', '==', date)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as HabitLog;
}

export async function getHabitLogsForRange(
  habitId: string,
  startDate: string,
  endDate: string
): Promise<HabitLog[]> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const logsCol = getHabitLogsCollection(userId);
  const q = query(
    logsCol,
    where('habitId', '==', habitId),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as HabitLog));
}

export async function getAllLogsForDate(date: string): Promise<HabitLog[]> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const logsCol = getHabitLogsCollection(userId);
  const q = query(logsCol, where('date', '==', date));

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as HabitLog));
}

export function subscribeToHabitLogsForDate(
  userId: string,
  date: string,
  callback: (logs: HabitLog[]) => void
): Unsubscribe {
  const logsCol = getHabitLogsCollection(userId);
  const q = query(logsCol, where('date', '==', date));

  return onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as HabitLog));
    callback(logs);
  });
}

export async function toggleHabitCompletion(
  habitId: string,
  date: string = getDateString()
): Promise<{ completed: boolean; logId: string | null }> {
  const existingLog = await getHabitLogForDate(habitId, date);

  if (existingLog) {
    // Toggle the completion status
    const newCompleted = !existingLog.completed;
    await updateHabitLog(existingLog.id, { completed: newCompleted });
    return { completed: newCompleted, logId: existingLog.id };
  } else {
    // Create a new completed log
    const logId = await createHabitLog({
      habitId,
      date,
      completed: true,
    });
    return { completed: true, logId };
  }
}

// Get the last N days of habit completion for a specific habit
export async function getHabitCompletionHistory(
  habitId: string,
  days: number = 30
): Promise<Map<string, boolean>> {
  const endDate = getDateString();
  const startDateObj = new Date();
  startDateObj.setDate(startDateObj.getDate() - days);
  const startDate = getDateString(startDateObj);

  const logs = await getHabitLogsForRange(habitId, startDate, endDate);
  
  const completionMap = new Map<string, boolean>();
  logs.forEach((log) => {
    completionMap.set(log.date, log.completed);
  });

  return completionMap;
}
