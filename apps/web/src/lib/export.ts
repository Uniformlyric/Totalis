/**
 * Data Export Service
 * Exports user data in JSON or CSV format
 */

import { collection, getDocs, query, where } from 'firebase/firestore';

export interface ExportOptions {
  format: 'json' | 'csv';
  includeCompleted?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface ExportData {
  exportedAt: string;
  user: {
    email: string | null;
    displayName: string | null;
  };
  tasks: any[];
  habits: any[];
  projects: any[];
  goals: any[];
  notes: any[];
  stats: {
    totalTasks: number;
    completedTasks: number;
    totalHabits: number;
    totalProjects: number;
    totalGoals: number;
    totalNotes: number;
  };
}

async function fetchCollection(collectionName: string, userId: string): Promise<any[]> {
  try {
    const { getDb } = await import('./firebase');
    const db = getDb();
    const ref = collection(db, collectionName);
    const q = query(ref, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Convert Firestore timestamps to ISO strings
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || doc.data().updatedAt,
      completedAt: doc.data().completedAt?.toDate?.()?.toISOString() || doc.data().completedAt,
      dueDate: doc.data().dueDate?.toDate?.()?.toISOString() || doc.data().dueDate,
      deadline: doc.data().deadline?.toDate?.()?.toISOString() || doc.data().deadline,
    }));
  } catch (error) {
    console.error(`Error fetching ${collectionName}:`, error);
    return [];
  }
}

export async function exportUserData(options: ExportOptions): Promise<string> {
  const { getAuthInstance } = await import('./firebase');
  const auth = getAuthInstance();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Fetch all user data in parallel
  const [tasks, habits, projects, goals, notes] = await Promise.all([
    fetchCollection('tasks', user.uid),
    fetchCollection('habits', user.uid),
    fetchCollection('projects', user.uid),
    fetchCollection('goals', user.uid),
    fetchCollection('notes', user.uid),
  ]);

  // Filter by date range if specified
  let filteredTasks = tasks;
  if (options.dateRange) {
    const { start, end } = options.dateRange;
    filteredTasks = tasks.filter(task => {
      const createdAt = new Date(task.createdAt);
      return createdAt >= start && createdAt <= end;
    });
  }

  // Filter out completed if specified
  if (!options.includeCompleted) {
    filteredTasks = filteredTasks.filter(t => !t.completed);
  }

  const exportData: ExportData = {
    exportedAt: new Date().toISOString(),
    user: {
      email: user.email,
      displayName: user.displayName,
    },
    tasks: filteredTasks,
    habits,
    projects,
    goals,
    notes,
    stats: {
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.completed).length,
      totalHabits: habits.length,
      totalProjects: projects.length,
      totalGoals: goals.length,
      totalNotes: notes.length,
    },
  };

  if (options.format === 'json') {
    return JSON.stringify(exportData, null, 2);
  } else {
    return convertToCSV(exportData);
  }
}

function convertToCSV(data: ExportData): string {
  const sections: string[] = [];

  // Header
  sections.push('# Totalis Data Export');
  sections.push(`# Exported: ${data.exportedAt}`);
  sections.push(`# User: ${data.user.email || 'Unknown'}`);
  sections.push('');

  // Stats Summary
  sections.push('# Summary');
  sections.push(`Total Tasks,${data.stats.totalTasks}`);
  sections.push(`Completed Tasks,${data.stats.completedTasks}`);
  sections.push(`Total Habits,${data.stats.totalHabits}`);
  sections.push(`Total Projects,${data.stats.totalProjects}`);
  sections.push(`Total Goals,${data.stats.totalGoals}`);
  sections.push(`Total Notes,${data.stats.totalNotes}`);
  sections.push('');

  // Tasks
  if (data.tasks.length > 0) {
    sections.push('# Tasks');
    sections.push('ID,Title,Status,Priority,Due Date,Project,Tags,Created At,Completed At');
    data.tasks.forEach(task => {
      sections.push([
        escapeCSV(task.id),
        escapeCSV(task.title),
        task.completed ? 'completed' : 'pending',
        escapeCSV(task.priority || 'medium'),
        escapeCSV(task.dueDate || ''),
        escapeCSV(task.projectId || ''),
        escapeCSV((task.tags || []).join(';')),
        escapeCSV(task.createdAt || ''),
        escapeCSV(task.completedAt || ''),
      ].join(','));
    });
    sections.push('');
  }

  // Habits
  if (data.habits.length > 0) {
    sections.push('# Habits');
    sections.push('ID,Name,Frequency,Current Streak,Best Streak,Total Completions,Created At');
    data.habits.forEach(habit => {
      sections.push([
        escapeCSV(habit.id),
        escapeCSV(habit.name),
        escapeCSV(habit.frequency || 'daily'),
        habit.currentStreak || 0,
        habit.bestStreak || 0,
        habit.totalCompletions || 0,
        escapeCSV(habit.createdAt || ''),
      ].join(','));
    });
    sections.push('');
  }

  // Projects
  if (data.projects.length > 0) {
    sections.push('# Projects');
    sections.push('ID,Name,Description,Status,Progress,Deadline,Created At');
    data.projects.forEach(project => {
      sections.push([
        escapeCSV(project.id),
        escapeCSV(project.name),
        escapeCSV(project.description || ''),
        escapeCSV(project.status || 'active'),
        project.progress || 0,
        escapeCSV(project.deadline || ''),
        escapeCSV(project.createdAt || ''),
      ].join(','));
    });
    sections.push('');
  }

  // Goals
  if (data.goals.length > 0) {
    sections.push('# Goals');
    sections.push('ID,Title,Description,Category,Status,Target,Current,Deadline,Created At');
    data.goals.forEach(goal => {
      sections.push([
        escapeCSV(goal.id),
        escapeCSV(goal.title),
        escapeCSV(goal.description || ''),
        escapeCSV(goal.category || ''),
        escapeCSV(goal.status || 'active'),
        goal.target || '',
        goal.current || '',
        escapeCSV(goal.deadline || ''),
        escapeCSV(goal.createdAt || ''),
      ].join(','));
    });
    sections.push('');
  }

  // Notes
  if (data.notes.length > 0) {
    sections.push('# Notes');
    sections.push('ID,Title,Content Preview,Tags,Created At,Updated At');
    data.notes.forEach(note => {
      const contentPreview = (note.content || '').substring(0, 100).replace(/\n/g, ' ');
      sections.push([
        escapeCSV(note.id),
        escapeCSV(note.title || 'Untitled'),
        escapeCSV(contentPreview),
        escapeCSV((note.tags || []).join(';')),
        escapeCSV(note.createdAt || ''),
        escapeCSV(note.updatedAt || ''),
      ].join(','));
    });
  }

  return sections.join('\n');
}

function escapeCSV(value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportAndDownload(options: ExportOptions): Promise<void> {
  const content = await exportUserData(options);
  const timestamp = new Date().toISOString().split('T')[0];
  
  if (options.format === 'json') {
    downloadFile(content, `totalis-export-${timestamp}.json`, 'application/json');
  } else {
    downloadFile(content, `totalis-export-${timestamp}.csv`, 'text/csv');
  }
}
