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
import type { Project } from '@totalis/shared';

// Helper to remove undefined values from an object
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

const getProjectsCollection = (userId: string) => {
  const db = getDb();
  return collection(db, 'users', userId, 'projects');
};

export async function createProject(
  project: Omit<Project, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const projectsCol = getProjectsCollection(userId);
  const now = Timestamp.now();

  const cleanProject = removeUndefined(project);

  const docRef = await addDoc(projectsCol, {
    ...cleanProject,
    userId,
    progress: 0,
    actualHours: 0,
    createdAt: now,
    updatedAt: now,
  });

  return docRef.id;
}

export async function updateProject(
  projectId: string,
  updates: Partial<Project>
): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const projectRef = doc(getDb(), 'users', userId, 'projects', projectId);
  const cleanUpdates = removeUndefined(updates);

  await updateDoc(projectRef, {
    ...cleanUpdates,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const projectRef = doc(getDb(), 'users', userId, 'projects', projectId);
  await deleteDoc(projectRef);
}

export async function getProject(projectId: string): Promise<Project | null> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const projectRef = doc(getDb(), 'users', userId, 'projects', projectId);
  const snapshot = await getDoc(projectRef);

  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Project;
}

export async function getProjects(filters?: {
  status?: Project['status'];
  goalId?: string;
}): Promise<Project[]> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const projectsCol = getProjectsCollection(userId);
  let q = query(projectsCol, orderBy('createdAt', 'desc'));

  if (filters?.status) {
    q = query(q, where('status', '==', filters.status));
  }
  if (filters?.goalId) {
    q = query(q, where('goalId', '==', filters.goalId));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project));
}

export function subscribeToProjects(
  userId: string,
  callback: (projects: Project[]) => void,
  filters?: { status?: Project['status']; goalId?: string }
): Unsubscribe {
  const projectsCol = getProjectsCollection(userId);
  let q = query(projectsCol, orderBy('createdAt', 'desc'));

  if (filters?.status) {
    q = query(q, where('status', '==', filters.status));
  }

  return onSnapshot(q, (snapshot) => {
    const projects = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as Project));
    callback(projects);
  });
}

export async function archiveProject(projectId: string): Promise<void> {
  await updateProject(projectId, { status: 'archived' });
}

export async function completeProject(projectId: string): Promise<void> {
  await updateProject(projectId, { 
    status: 'completed',
    progress: 100,
  });
}
