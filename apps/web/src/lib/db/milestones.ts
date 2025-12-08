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
  writeBatch,
} from 'firebase/firestore';
import { getDb, getAuthInstance } from '../firebase';
import type { Milestone } from '@totalis/shared';

// Helper to remove undefined values from an object
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

const getMilestonesCollection = (userId: string) => {
  const db = getDb();
  return collection(db, 'users', userId, 'milestones');
};

/**
 * Create a new milestone
 */
export async function createMilestone(
  milestone: Omit<Milestone, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const milestonesCol = getMilestonesCollection(userId);
  const now = Timestamp.now();

  const cleanMilestone = removeUndefined(milestone);

  const docRef = await addDoc(milestonesCol, {
    ...cleanMilestone,
    userId,
    progress: 0,
    actualHours: 0,
    taskCount: 0,
    completedTaskCount: 0,
    dependencies: milestone.dependencies || [],
    createdAt: now,
    updatedAt: now,
  });

  // Update project milestone count
  if (milestone.projectId) {
    await updateProjectMilestoneCount(milestone.projectId);
  }

  return docRef.id;
}

/**
 * Create multiple milestones in a batch
 */
export async function createMilestones(
  milestones: Omit<Milestone, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[]
): Promise<string[]> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const db = getDb();
  const batch = writeBatch(db);
  const milestoneIds: string[] = [];
  const now = Timestamp.now();

  const milestonesCol = getMilestonesCollection(userId);

  for (const milestone of milestones) {
    const docRef = doc(milestonesCol);
    milestoneIds.push(docRef.id);

    const cleanMilestone = removeUndefined(milestone);

    batch.set(docRef, {
      ...cleanMilestone,
      userId,
      progress: 0,
      actualHours: 0,
      taskCount: 0,
      completedTaskCount: 0,
      dependencies: milestone.dependencies || [],
      createdAt: now,
      updatedAt: now,
    });
  }

  await batch.commit();

  // Update project milestone count if applicable
  if (milestones.length > 0 && milestones[0].projectId) {
    await updateProjectMilestoneCount(milestones[0].projectId);
  }

  return milestoneIds;
}

/**
 * Update an existing milestone
 */
export async function updateMilestone(
  milestoneId: string,
  updates: Partial<Milestone>
): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const milestoneRef = doc(getDb(), 'users', userId, 'milestones', milestoneId);
  const cleanUpdates = removeUndefined(updates);

  await updateDoc(milestoneRef, {
    ...cleanUpdates,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Delete a milestone
 */
export async function deleteMilestone(milestoneId: string): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const milestone = await getMilestone(milestoneId);
  if (!milestone) throw new Error('Milestone not found');

  const milestoneRef = doc(getDb(), 'users', userId, 'milestones', milestoneId);
  await deleteDoc(milestoneRef);

  // Update project milestone count
  if (milestone.projectId) {
    await updateProjectMilestoneCount(milestone.projectId);
  }
}

/**
 * Get a single milestone by ID
 */
export async function getMilestone(milestoneId: string): Promise<Milestone | null> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const milestoneRef = doc(getDb(), 'users', userId, 'milestones', milestoneId);
  const snapshot = await getDoc(milestoneRef);

  if (!snapshot.exists()) return null;
  
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    createdAt: data.createdAt?.toDate?.() || data.createdAt,
    updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
    startDate: data.startDate?.toDate?.() || data.startDate,
    deadline: data.deadline?.toDate?.() || data.deadline,
    completedAt: data.completedAt?.toDate?.() || data.completedAt,
  } as Milestone;
}

/**
 * Get all milestones with optional filters
 */
export async function getMilestones(filters?: {
  projectId?: string;
  status?: Milestone['status'];
}): Promise<Milestone[]> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const milestonesCol = getMilestonesCollection(userId);
  let q = query(milestonesCol, orderBy('order', 'asc'));

  if (filters?.projectId) {
    q = query(q, where('projectId', '==', filters.projectId));
  }

  if (filters?.status) {
    q = query(q, where('status', '==', filters.status));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      startDate: data.startDate?.toDate?.() || data.startDate,
      deadline: data.deadline?.toDate?.() || data.deadline,
      completedAt: data.completedAt?.toDate?.() || data.completedAt,
    } as Milestone;
  });
}

/**
 * Subscribe to milestone updates (real-time)
 */
export function subscribeToMilestones(
  projectId: string,
  callback: (milestones: Milestone[]) => void
): Unsubscribe {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const milestonesCol = getMilestonesCollection(userId);
  const q = query(
    milestonesCol,
    where('projectId', '==', projectId),
    orderBy('order', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    const milestones = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        startDate: data.startDate?.toDate?.() || data.startDate,
        deadline: data.deadline?.toDate?.() || data.deadline,
        completedAt: data.completedAt?.toDate?.() || data.completedAt,
      } as Milestone;
    });
    callback(milestones);
  });
}

/**
 * Subscribe to ALL milestones for a user (for modal dropdowns)
 */
export function subscribeToAllMilestones(
  userId: string,
  callback: (milestones: Milestone[]) => void
): Unsubscribe {
  const milestonesCol = getMilestonesCollection(userId);
  const q = query(milestonesCol, orderBy('order', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const milestones = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        startDate: data.startDate?.toDate?.() || data.startDate,
        deadline: data.deadline?.toDate?.() || data.deadline,
        completedAt: data.completedAt?.toDate?.() || data.completedAt,
      } as Milestone;
    });
    callback(milestones);
  });
}

/**
 * Calculate and update milestone progress based on tasks
 */
export async function recalculateMilestoneProgress(milestoneId: string): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  // Get all tasks for this milestone
  const { getTasks } = await import('./tasks');
  const tasks = await getTasks({ milestoneId });

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Calculate actual hours
  const actualHours = tasks.reduce((sum, task) => {
    return sum + ((task.actualMinutes || 0) / 60);
  }, 0);

  // Update milestone
  await updateMilestone(milestoneId, {
    taskCount: totalTasks,
    completedTaskCount: completedTasks,
    progress,
    actualHours,
    status: completedTasks === totalTasks && totalTasks > 0 ? 'completed' : 
            completedTasks > 0 ? 'in_progress' : 'pending',
    completedAt: completedTasks === totalTasks && totalTasks > 0 ? new Date() : undefined,
  });

  // Update parent project progress
  const milestone = await getMilestone(milestoneId);
  if (milestone?.projectId) {
    await recalculateProjectProgress(milestone.projectId);
  }
}

/**
 * Update project milestone count
 */
async function updateProjectMilestoneCount(projectId: string): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const milestones = await getMilestones({ projectId });
  const completedMilestones = milestones.filter((m) => m.status === 'completed').length;

  const { updateProject } = await import('./projects');
  await updateProject(projectId, {
    milestoneCount: milestones.length,
    completedMilestoneCount: completedMilestones,
  });
}

/**
 * Calculate and update project progress based on milestones and tasks
 */
async function recalculateProjectProgress(projectId: string): Promise<void> {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');

  const milestones = await getMilestones({ projectId });
  const { getTasks } = await import('./tasks');
  const tasks = await getTasks({ projectId });

  // Calculate progress from milestones (weighted by hours)
  const totalEstimatedHours = milestones.reduce((sum, m) => sum + m.estimatedHours, 0);
  const weightedProgress = milestones.reduce((sum, m) => {
    const weight = totalEstimatedHours > 0 ? m.estimatedHours / totalEstimatedHours : 1 / milestones.length;
    return sum + (m.progress * weight);
  }, 0);

  const progress = milestones.length > 0 ? Math.round(weightedProgress) : 
                   tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100) : 0;

  // Calculate actual hours
  const actualHours = tasks.reduce((sum, task) => {
    return sum + ((task.actualMinutes || 0) / 60);
  }, 0);

  const { updateProject } = await import('./projects');
  await updateProject(projectId, {
    progress,
    actualHours,
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((t) => t.status === 'completed').length,
    status: progress === 100 ? 'completed' : progress > 0 ? 'active' : 'active',
  });
}
