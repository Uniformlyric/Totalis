import { useState, useEffect, useCallback } from 'react';
import { QuickCaptureModal } from './QuickCaptureModal';
import type { ParsedItem, ParsedTask, ParsedHabit, ParsedProject, ParsedGoal, UpdateItem } from '@/lib/ai/gemini';
import type { Project, Goal, Task, Habit } from '@totalis/shared';
import type { User } from 'firebase/auth';

interface QuickCaptureProviderProps {
  children: React.ReactNode;
}

// Get API key from environment (Astro passes this via import.meta.env)
const GEMINI_API_KEY = import.meta.env.PUBLIC_GEMINI_API_KEY || '';

// Debug: log if API key is available (first 10 chars only for security)
if (typeof window !== 'undefined') {
  console.log('[QuickCapture] API Key status:', GEMINI_API_KEY ? `Available (${GEMINI_API_KEY.substring(0, 10)}...)` : 'NOT FOUND');
}

export function QuickCaptureProvider({ children }: QuickCaptureProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Check auth and load context data
  useEffect(() => {
    let unsubscribes: (() => void)[] = [];

    const init = async () => {
      try {
        const { getAuthInstance } = await import('@/lib/firebase');
        const { onAuthStateChanged } = await import('firebase/auth');
        const auth = getAuthInstance();

        const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
          setUser(firebaseUser);

          if (firebaseUser) {
            // Load ALL data for context
            const { subscribeToTasks } = await import('@/lib/db/tasks');
            const { subscribeToHabits } = await import('@/lib/db/habits');
            const { subscribeToProjects } = await import('@/lib/db/projects');
            const { subscribeToGoals } = await import('@/lib/db/goals');

            const unsubTasks = subscribeToTasks(setTasks);
            const unsubHabits = subscribeToHabits(firebaseUser.uid, setHabits);
            const unsubProjects = subscribeToProjects(firebaseUser.uid, setProjects);
            const unsubGoals = subscribeToGoals(firebaseUser.uid, setGoals);

            unsubscribes.push(unsubTasks, unsubHabits, unsubProjects, unsubGoals);
          }
        });

        unsubscribes.push(unsubAuth);
      } catch (err) {
        console.error('QuickCapture init error:', err);
      }
    };

    init();

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, []);

  // Global keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (user) {
          setIsOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user]);

  // Handle creating items in Firestore
  const handleItemsCreated = useCallback(async (items: ParsedItem[]) => {
    if (!user || items.length === 0) return;

    setIsCreating(true);

    try {
      const { createTask } = await import('@/lib/db/tasks');
      const { createHabit } = await import('@/lib/db/habits');
      const { createProject } = await import('@/lib/db/projects');
      const { createGoal } = await import('@/lib/db/goals');

      // Process items in order
      for (const item of items) {
        try {
          switch (item.type) {
            case 'task': {
              const taskItem = item as ParsedTask;
              
              // Find matching project if specified
              let projectId: string | undefined;
              if (taskItem.projectName) {
                const matchedProject = projects.find(
                  p => p.title.toLowerCase().includes(taskItem.projectName!.toLowerCase()) ||
                       taskItem.projectName!.toLowerCase().includes(p.title.toLowerCase())
                );
                projectId = matchedProject?.id;
              }

              await createTask({
                title: taskItem.title,
                description: taskItem.description,
                priority: taskItem.priority,
                status: 'pending',
                dueDate: taskItem.dueDate ? new Date(taskItem.dueDate) : undefined,
                scheduledStart: taskItem.scheduledStart ? new Date(taskItem.scheduledStart) : undefined,
                projectId,
                estimatedMinutes: taskItem.estimatedMinutes || 30,
                estimatedSource: 'ai',
                tags: taskItem.tags,
                blockedBy: [],
                blocking: [],
                reminders: [],
              });
              break;
            }

            case 'habit': {
              const habitItem = item as ParsedHabit;
              await createHabit({
                title: habitItem.title,
                description: habitItem.description,
                frequency: habitItem.frequency,
                daysOfWeek: habitItem.daysOfWeek,
                targetPerDay: habitItem.targetPerDay,
                reminderTime: habitItem.reminderTime,
                color: habitItem.color,
                tags: habitItem.tags,
                isArchived: false,
              });
              break;
            }

            case 'project': {
              const projectItem = item as ParsedProject;
              
              // Find matching goal if specified
              let goalId: string | undefined;
              if (projectItem.goalName) {
                const matchedGoal = goals.find(
                  g => g.title.toLowerCase().includes(projectItem.goalName!.toLowerCase()) ||
                       projectItem.goalName!.toLowerCase().includes(g.title.toLowerCase())
                );
                goalId = matchedGoal?.id;
              }

              // Check if project has milestones (new structured format)
              if (projectItem.milestones && projectItem.milestones.length > 0) {
                // Use new structured project creation
                const { createProjectWithMilestones } = await import('@/lib/ai/project-creator');
                const result = await createProjectWithMilestones({
                  ...projectItem,
                  goalName: goalId ? undefined : projectItem.goalName, // Pass goalId in project data below
                });
                console.log(`✅ Created project "${projectItem.title}" with ${result.milestoneIds.length} milestones and ${result.totalTasks} tasks`);
              } else {
                // Legacy: simple project without milestones
                await createProject({
                  title: projectItem.title,
                  description: projectItem.description,
                  deadline: projectItem.deadline ? new Date(projectItem.deadline) : undefined,
                  estimatedHours: projectItem.estimatedHours || 0,
                  goalId,
                  status: 'active',
                  progress: 0,
                  taskCount: 0,
                  completedTaskCount: 0,
                  milestoneCount: 0,
                  completedMilestoneCount: 0,
                  actualHours: 0,
                  color: projectItem.color,
                  tags: projectItem.tags,
                });
              }
              break;
            }

            case 'goal': {
              const goalItem = item as ParsedGoal;
              await createGoal({
                title: goalItem.title,
                description: goalItem.description,
                deadline: goalItem.deadline ? new Date(goalItem.deadline) : undefined,
                timeframe: goalItem.timeframe,
                targetValue: goalItem.targetValue,
                unit: goalItem.unit,
                status: 'active',
                progress: 0,
                color: goalItem.color,
                tags: goalItem.tags,
              });
              break;
            }
          }
        } catch (err) {
          console.error(`Failed to create ${item.type}:`, err);
        }
      }

      // Show success notification (could use a toast library)
      console.log(`✅ Created ${items.length} item(s)`);
    } catch (err) {
      console.error('Failed to create items:', err);
    } finally {
      setIsCreating(false);
    }
  }, [user, projects, goals]);

  // Handle updating existing items in Firestore
  const handleItemsUpdated = useCallback(async (updates: UpdateItem[]) => {
    if (!user || updates.length === 0) return;

    setIsCreating(true);

    try {
      const { updateTask } = await import('@/lib/db/tasks');
      const { updateHabit } = await import('@/lib/db/habits');
      const { updateProject } = await import('@/lib/db/projects');
      const { updateGoal } = await import('@/lib/db/goals');

      for (const update of updates) {
        try {
          switch (update.type) {
            case 'update_task': {
              const changes: Record<string, unknown> = {};
              if (update.title !== undefined) changes.title = update.title;
              if (update.description !== undefined) changes.description = update.description;
              if (update.priority !== undefined) changes.priority = update.priority;
              if (update.dueDate !== undefined) changes.dueDate = update.dueDate ? new Date(update.dueDate) : null;
              if (update.status !== undefined) changes.status = update.status;
              if (update.estimatedMinutes !== undefined) changes.estimatedMinutes = update.estimatedMinutes;
              if (update.tags !== undefined) changes.tags = update.tags;
              
              if (Object.keys(changes).length > 0) {
                await updateTask(update.id, changes);
                console.log(`✅ Updated task ${update.id}`);
              }
              break;
            }

            case 'update_habit': {
              const changes: Record<string, unknown> = {};
              if (update.title !== undefined) changes.title = update.title;
              if (update.description !== undefined) changes.description = update.description;
              if (update.frequency !== undefined) changes.frequency = update.frequency;
              if (update.daysOfWeek !== undefined) changes.daysOfWeek = update.daysOfWeek;
              if (update.targetPerDay !== undefined) changes.targetPerDay = update.targetPerDay;
              if (update.reminderTime !== undefined) changes.reminderTime = update.reminderTime;
              if (update.color !== undefined) changes.color = update.color;
              if (update.tags !== undefined) changes.tags = update.tags;
              
              if (Object.keys(changes).length > 0) {
                await updateHabit(update.id, changes);
                console.log(`✅ Updated habit ${update.id}`);
              }
              break;
            }

            case 'update_project': {
              const changes: Record<string, unknown> = {};
              if (update.title !== undefined) changes.title = update.title;
              if (update.description !== undefined) changes.description = update.description;
              if (update.deadline !== undefined) changes.deadline = update.deadline ? new Date(update.deadline) : null;
              if (update.estimatedHours !== undefined) changes.estimatedHours = update.estimatedHours;
              if (update.status !== undefined) changes.status = update.status;
              if (update.color !== undefined) changes.color = update.color;
              if (update.tags !== undefined) changes.tags = update.tags;
              
              if (Object.keys(changes).length > 0) {
                await updateProject(update.id, changes);
                console.log(`✅ Updated project ${update.id}`);
              }
              break;
            }

            case 'update_goal': {
              const changes: Record<string, unknown> = {};
              if (update.title !== undefined) changes.title = update.title;
              if (update.description !== undefined) changes.description = update.description;
              if (update.deadline !== undefined) changes.deadline = update.deadline ? new Date(update.deadline) : null;
              if (update.timeframe !== undefined) changes.timeframe = update.timeframe;
              if (update.targetValue !== undefined) changes.targetValue = update.targetValue;
              if (update.unit !== undefined) changes.unit = update.unit;
              if (update.status !== undefined) changes.status = update.status;
              if (update.color !== undefined) changes.color = update.color;
              if (update.tags !== undefined) changes.tags = update.tags;
              
              if (Object.keys(changes).length > 0) {
                await updateGoal(update.id, changes);
                console.log(`✅ Updated goal ${update.id}`);
              }
              break;
            }
          }
        } catch (err) {
          console.error(`Failed to update ${update.type}:`, err);
        }
      }

      console.log(`✅ Updated ${updates.length} item(s)`);
    } catch (err) {
      console.error('Failed to update items:', err);
    } finally {
      setIsCreating(false);
    }
  }, [user]);

  return (
    <>
      {children}
      
      {/* Floating Quick Capture Button */}
      {user && !isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 p-4 bg-primary text-white rounded-full shadow-lg hover:bg-primary-dark transition-all hover:scale-105 group"
          title="Quick Capture (Ctrl+K)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-surface text-text text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Quick Capture <kbd className="ml-1 px-1 bg-surface-hover rounded">⌘K</kbd>
          </span>
        </button>
      )}

      {/* Modal */}
      {GEMINI_API_KEY ? (
        <QuickCaptureModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onItemsCreated={handleItemsCreated}
          onItemsUpdated={handleItemsUpdated}
          existingTasks={tasks}
          existingHabits={habits}
          existingProjects={projects}
          existingGoals={goals}
          apiKey={GEMINI_API_KEY}
        />
      ) : isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl p-6 max-w-md text-center">
            <div className="w-12 h-12 bg-warning/10 text-warning rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 className="font-semibold text-text mb-2">API Key Required</h3>
            <p className="text-text-muted text-sm mb-4">
              Please add your Gemini API key to the .env file as GEMINI_API_KEY to enable AI features.
            </p>
            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 bg-surface-hover text-text rounded-lg hover:bg-border transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
