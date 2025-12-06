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
  writeBatch,
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

/**
 * Delete a project and all associated milestones and tasks (cascade delete)
 */
export async function deleteProjectWithCascade(projectId: string): Promise<{
  deletedMilestones: number;
  deletedTasks: number;
}> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  console.log('🗑️ Starting cascade delete for project:', projectId);

  const db = getDb();
  let deletedMilestones = 0;
  let deletedTasks = 0;

  // Step 1: Get all milestones for this project
  const milestonesCol = collection(db, 'users', userId, 'milestones');
  const milestonesQuery = query(milestonesCol, where('projectId', '==', projectId));
  const milestonesSnapshot = await getDocs(milestonesQuery);
  
  console.log(`  Found ${milestonesSnapshot.size} milestones to delete`);

  // Step 2: Delete all tasks for this project (including milestone tasks)
  const tasksCol = collection(db, 'users', userId, 'tasks');
  const tasksQuery = query(tasksCol, where('projectId', '==', projectId));
  const tasksSnapshot = await getDocs(tasksQuery);
  
  console.log(`  Found ${tasksSnapshot.size} tasks to delete`);
  
  // Delete tasks in batches (Firestore batch limit is 500)
  const taskBatches: any[][] = [];
  let currentBatch: any[] = [];
  
  tasksSnapshot.docs.forEach((doc) => {
    currentBatch.push(doc);
    if (currentBatch.length === 500) {
      taskBatches.push(currentBatch);
      currentBatch = [];
    }
  });
  if (currentBatch.length > 0) {
    taskBatches.push(currentBatch);
  }

  for (const batch of taskBatches) {
    const deleteBatch = writeBatch(db);
    batch.forEach((doc) => {
      deleteBatch.delete(doc.ref);
      deletedTasks++;
    });
    await deleteBatch.commit();
  }

  console.log(`  ✓ Deleted ${deletedTasks} tasks`);

  // Step 3: Delete all milestones
  const milestoneBatches: any[][] = [];
  currentBatch = [];
  
  milestonesSnapshot.docs.forEach((doc) => {
    currentBatch.push(doc);
    if (currentBatch.length === 500) {
      milestoneBatches.push(currentBatch);
      currentBatch = [];
    }
  });
  if (currentBatch.length > 0) {
    milestoneBatches.push(currentBatch);
  }

  for (const batch of milestoneBatches) {
    const deleteBatch = writeBatch(db);
    batch.forEach((doc) => {
      deleteBatch.delete(doc.ref);
      deletedMilestones++;
    });
    await deleteBatch.commit();
  }

  console.log(`  ✓ Deleted ${deletedMilestones} milestones`);

  // Step 4: Delete the project itself
  const projectRef = doc(db, 'users', userId, 'projects', projectId);
  await deleteDoc(projectRef);

  console.log('✅ Cascade delete complete');

  return { deletedMilestones, deletedTasks };
}
