/**
 * AI-powered project creation with structured milestones and tasks
 */

import { createProject } from '../db/projects';
import { createMilestones } from '../db/milestones';
import { createTask } from '../db/tasks';
import type { ParsedProject, ParsedMilestone } from './gemini';

export interface ProjectCreationResult {
  projectId: string;
  milestoneIds: string[];
  taskIds: string[];
  totalTasks: number;
  totalEstimatedHours: number;
}

/**
 * Create a complete project structure with milestones and tasks
 */
export async function createProjectWithMilestones(
  parsedProject: ParsedProject
): Promise<ProjectCreationResult> {
  console.log('🚀 Creating project with milestones:', {
    title: parsedProject.title,
    milestoneCount: parsedProject.milestones.length,
    milestones: parsedProject.milestones.map(m => ({
      title: m.title,
      taskCount: m.tasks?.length || 0,
    })),
  });

  const result: ProjectCreationResult = {
    projectId: '',
    milestoneIds: [],
    taskIds: [],
    totalTasks: 0,
    totalEstimatedHours: parsedProject.estimatedHours || 0,
  };

  // Step 1: Create the project
  const projectId = await createProject({
    title: parsedProject.title,
    description: parsedProject.description,
    deadline: parsedProject.deadline ? new Date(parsedProject.deadline) : undefined,
    estimatedHours: parsedProject.estimatedHours || 0,
    status: 'active',
    progress: 0,
    taskCount: 0,
    completedTaskCount: 0,
    milestoneCount: parsedProject.milestones.length,
    completedMilestoneCount: 0,
    startDate: parsedProject.calculatedStartDate ? new Date(parsedProject.calculatedStartDate) : undefined,
    tags: parsedProject.tags || [],
    color: parsedProject.color,
  });

  result.projectId = projectId;

  // Step 2: Create milestones if any
  if (parsedProject.milestones && parsedProject.milestones.length > 0) {
    const milestonesToCreate = parsedProject.milestones.map((milestone) => ({
      projectId,
      title: milestone.title,
      description: milestone.description,
      order: milestone.order,
      estimatedHours: milestone.estimatedHours,
      deadline: milestone.deadline ? new Date(milestone.deadline) : undefined,
      status: 'pending' as const,
      progress: 0,
      taskCount: milestone.tasks?.length || 0,
      completedTaskCount: 0,
      actualHours: 0,
      dependencies: milestone.dependencies || [],
    }));

    const milestoneIds = await createMilestones(milestonesToCreate);
    result.milestoneIds = milestoneIds;
    console.log('✅ Created milestones:', milestoneIds);

    // Step 3: Create tasks for each milestone
    for (let i = 0; i < parsedProject.milestones.length; i++) {
      const milestone = parsedProject.milestones[i];
      const milestoneId = milestoneIds[i];

      if (milestone.tasks && milestone.tasks.length > 0) {
        console.log(`📝 Creating ${milestone.tasks.length} tasks for milestone:`, {
          milestoneTitle: milestone.title,
          milestoneId,
          milestoneOrder: milestone.order,
        });

        for (const taskData of milestone.tasks) {
          const taskId = await createTask({
            title: taskData.title,
            description: taskData.description,
            projectId,
            milestoneId,
            priority: taskData.priority || 'medium',
            status: 'pending',
            estimatedMinutes: taskData.estimatedMinutes || 60,
            estimatedSource: 'ai',
            dueDate: taskData.dueDate ? new Date(taskData.dueDate) : undefined,
            tags: taskData.tags || [],
            blockedBy: [],
            blocking: [],
            reminders: [],
            syncStatus: 'synced',
          });

          console.log(`  ✓ Created task "${taskData.title}" with milestoneId: ${milestoneId}`);
          result.taskIds.push(taskId);
          result.totalTasks++;
        }
      }
    }
  } else {
    // No milestones - this shouldn't happen with new AI, but handle legacy
    console.warn('Project created without milestones:', parsedProject.title);
  }

  // Step 4: Recalculate project progress
  const { recalculateMilestoneProgress } = await import('../db/milestones');
  for (const milestoneId of result.milestoneIds) {
    await recalculateMilestoneProgress(milestoneId);
  }

  console.log('🎉 Project creation complete:', {
    projectId: result.projectId,
    milestones: result.milestoneIds.length,
    tasks: result.totalTasks,
  });

  return result;
}

/**
 * Estimate when tasks should be scheduled based on milestone dependencies
 */
export function calculateMilestoneSchedule(
  milestones: ParsedMilestone[],
  projectDeadline?: Date,
  userWeeklyCapacity: number = 40
): Map<number, { startDate: Date; endDate: Date }> {
  const schedule = new Map<number, { startDate: Date; endDate: Date }>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Simple forward scheduling
  let currentDate = new Date(today);

  for (const milestone of milestones.sort((a, b) => a.order - b.order)) {
    // Check if milestone has dependencies
    const dependsOn = milestone.dependencies || [];
    if (dependsOn.length > 0) {
      // Start after all dependencies complete
      const latestDependencyEnd = Math.max(
        ...dependsOn.map(idx => schedule.get(idx)?.endDate.getTime() || 0)
      );
      if (latestDependencyEnd > 0) {
        currentDate = new Date(latestDependencyEnd);
      }
    }

    // Calculate duration based on hours and capacity
    const weeksNeeded = Math.ceil(milestone.estimatedHours / userWeeklyCapacity);
    const daysNeeded = weeksNeeded * 7;

    const startDate = new Date(currentDate);
    const endDate = new Date(currentDate);
    endDate.setDate(endDate.getDate() + daysNeeded);

    schedule.set(milestone.order - 1, { startDate, endDate });
    currentDate = endDate;
  }

  return schedule;
}
