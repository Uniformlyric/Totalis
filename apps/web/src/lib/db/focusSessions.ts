import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
  type Unsubscribe,
  limit,
} from 'firebase/firestore';
import { getDb, getAuthInstance } from '../firebase';
import type { FocusSession } from '@totalis/shared';

const getFocusSessionsCollection = (userId: string) => {
  const db = getDb();
  return collection(db, 'users', userId, 'focusSessions');
};

export async function createFocusSession(
  session: Omit<FocusSession, 'id' | 'userId'>
): Promise<string> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const sessionsCol = getFocusSessionsCollection(userId);

  const docRef = await addDoc(sessionsCol, {
    ...session,
    userId,
    startedAt: Timestamp.fromDate(session.startedAt),
    endedAt: session.endedAt ? Timestamp.fromDate(session.endedAt) : null,
  });

  return docRef.id;
}

export async function updateFocusSession(
  sessionId: string,
  updates: Partial<Pick<FocusSession, 'actualDuration' | 'status' | 'endedAt' | 'notes'>>
): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const sessionRef = doc(getDb(), 'users', userId, 'focusSessions', sessionId);
  
  const data: Record<string, any> = { ...updates };
  if (updates.endedAt) {
    data.endedAt = Timestamp.fromDate(updates.endedAt);
  }
  
  await updateDoc(sessionRef, data);
}

export function subscribeToFocusSessions(
  userId: string,
  callback: (sessions: FocusSession[]) => void,
  limitCount: number = 50
): Unsubscribe {
  const sessionsCol = getFocusSessionsCollection(userId);
  const q = query(sessionsCol, orderBy('startedAt', 'desc'), limit(limitCount));

  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        startedAt: data.startedAt?.toDate() || new Date(),
        endedAt: data.endedAt?.toDate() || undefined,
      } as FocusSession;
    });
    callback(sessions);
  });
}

export function subscribeToFocusSessionsForTask(
  userId: string,
  taskId: string,
  callback: (sessions: FocusSession[]) => void
): Unsubscribe {
  const sessionsCol = getFocusSessionsCollection(userId);
  const q = query(
    sessionsCol,
    where('taskId', '==', taskId),
    orderBy('startedAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        startedAt: data.startedAt?.toDate() || new Date(),
        endedAt: data.endedAt?.toDate() || undefined,
      } as FocusSession;
    });
    callback(sessions);
  });
}

export function subscribeToTodaysFocusSessions(
  userId: string,
  callback: (sessions: FocusSession[]) => void
): Unsubscribe {
  const sessionsCol = getFocusSessionsCollection(userId);
  
  // Get start of today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const q = query(
    sessionsCol,
    where('startedAt', '>=', Timestamp.fromDate(today)),
    orderBy('startedAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        startedAt: data.startedAt?.toDate() || new Date(),
        endedAt: data.endedAt?.toDate() || undefined,
      } as FocusSession;
    });
    callback(sessions);
  });
}

// Calculate total focus time for today
export function calculateTodaysFocusMinutes(sessions: FocusSession[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return sessions
    .filter(s => {
      const sessionDate = new Date(s.startedAt);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate.getTime() === today.getTime() && s.status === 'completed';
    })
    .reduce((total, s) => total + s.actualDuration, 0);
}
