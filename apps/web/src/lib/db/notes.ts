import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb, getAuthInstance } from '../firebase';
import type { Note } from '@totalis/shared';

const getNotesCollection = (userId: string) => {
  const db = getDb();
  return collection(db, 'users', userId, 'notes');
};

export async function createNote(
  note: Omit<Note, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const notesCol = getNotesCollection(userId);
  const now = Timestamp.now();

  const docRef = await addDoc(notesCol, {
    ...note,
    userId,
    createdAt: now,
    updatedAt: now,
  });

  return docRef.id;
}

export async function updateNote(
  noteId: string,
  updates: Partial<Pick<Note, 'title' | 'content' | 'isPinned' | 'tags'>>
): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const noteRef = doc(getDb(), 'users', userId, 'notes', noteId);
  await updateDoc(noteRef, {
    ...updates,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteNote(noteId: string): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const noteRef = doc(getDb(), 'users', userId, 'notes', noteId);
  await deleteDoc(noteRef);
}

export interface NoteFilters {
  taskId?: string;
  projectId?: string;
  goalId?: string;
  isPinned?: boolean;
}

export function subscribeToNotes(
  userId: string,
  callback: (notes: Note[]) => void,
  filters?: NoteFilters
): Unsubscribe {
  const notesCol = getNotesCollection(userId);
  
  let q = query(notesCol, orderBy('updatedAt', 'desc'));
  
  if (filters?.taskId) {
    q = query(notesCol, where('taskId', '==', filters.taskId), orderBy('updatedAt', 'desc'));
  } else if (filters?.projectId) {
    q = query(notesCol, where('projectId', '==', filters.projectId), orderBy('updatedAt', 'desc'));
  } else if (filters?.goalId) {
    q = query(notesCol, where('goalId', '==', filters.goalId), orderBy('updatedAt', 'desc'));
  } else if (filters?.isPinned !== undefined) {
    q = query(notesCol, where('isPinned', '==', filters.isPinned), orderBy('updatedAt', 'desc'));
  }

  return onSnapshot(q, (snapshot) => {
    const notes = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as Note;
    });
    callback(notes);
  });
}

export function subscribeToNotesForTask(
  userId: string,
  taskId: string,
  callback: (notes: Note[]) => void
): Unsubscribe {
  return subscribeToNotes(userId, callback, { taskId });
}

export function subscribeToNotesForProject(
  userId: string,
  projectId: string,
  callback: (notes: Note[]) => void
): Unsubscribe {
  return subscribeToNotes(userId, callback, { projectId });
}

export function subscribeToNotesForGoal(
  userId: string,
  goalId: string,
  callback: (notes: Note[]) => void
): Unsubscribe {
  return subscribeToNotes(userId, callback, { goalId });
}

export function subscribeToPinnedNotes(
  userId: string,
  callback: (notes: Note[]) => void
): Unsubscribe {
  return subscribeToNotes(userId, callback, { isPinned: true });
}
