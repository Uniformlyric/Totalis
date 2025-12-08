/**
 * Learning Module
 * 
 * Tracks actual vs estimated time to calibrate future estimates.
 * Learns patterns from user behavior to improve scheduling accuracy.
 */

import type { Task } from '@totalis/shared';
import type { TimeOfDay, TaskCompletionRecord } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface LearningData {
  completionRecords: TaskCompletionRecord[];
  categoryMultipliers: Map<string, number>;
  projectMultipliers: Map<string, number>;
  globalMultiplier: number;
  productivityByHour: number[];       // 24 values, one per hour
  productivityByDay: number[];        // 7 values, Sun-Sat
  peakHours: number[];                // Hours with highest productivity
  lastUpdated: Date;
}

export interface ProductivityInsight {
  type: 'peak_hours' | 'best_day' | 'estimate_accuracy' | 'category_pattern';
  title: string;
  description: string;
  recommendation?: string;
}

export interface AdjustedEstimate {
  adjustedMinutes: number;
  multiplier: number;
  confidence: number;
  reason: string;
}

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'totalis_scheduler_learning';

/**
 * Initialize empty learning data
 */
export function initializeLearningData(): LearningData {
  return {
    completionRecords: [],
    categoryMultipliers: new Map(),
    projectMultipliers: new Map(),
    globalMultiplier: 1.0,
    productivityByHour: new Array(24).fill(0),
    productivityByDay: new Array(7).fill(0),
    peakHours: [],
    lastUpdated: new Date()
  };
}

/**
 * Load learning data from localStorage
 */
export function loadLearningData(): LearningData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return initializeLearningData();
    
    const parsed = JSON.parse(stored);
    
    return {
      ...parsed,
      categoryMultipliers: new Map(Object.entries(parsed.categoryMultipliers || {})),
      projectMultipliers: new Map(Object.entries(parsed.projectMultipliers || {})),
      lastUpdated: new Date(parsed.lastUpdated)
    };
  } catch (error) {
    console.error('Error loading learning data:', error);
    return initializeLearningData();
  }
}

/**
 * Save learning data to localStorage
 */
export function saveLearningData(data: LearningData): void {
  try {
    const toStore = {
      ...data,
      categoryMultipliers: Object.fromEntries(data.categoryMultipliers),
      projectMultipliers: Object.fromEntries(data.projectMultipliers),
      lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (error) {
    console.error('Error saving learning data:', error);
  }
}

// ============================================================================
// RECORDING
// ============================================================================

/**
 * Record a task completion for learning
 */
export function recordTaskCompletion(
  task: Task,
  actualMinutes: number,
  data: LearningData
): LearningData {
  const estimatedMinutes = task.estimatedMinutes || 60;
  const accuracy = estimatedMinutes > 0 ? actualMinutes / estimatedMinutes : 1;
  const now = new Date();
  
  const record: TaskCompletionRecord = {
    taskId: task.id,
    estimatedMinutes,
    actualMinutes,
    scheduledDate: '', // Would be populated from actual scheduled date
    completedDate: now.toISOString().split('T')[0],
    wasRescheduled: false,
    rescheduleCount: 0,
    priority: task.priority,
    projectId: task.projectId,
    tags: task.tags || []
  };

  // Add to records (keep last 500)
  const records = [record, ...data.completionRecords].slice(0, 500);
  
  // Update productivity by hour
  const hour = now.getHours();
  const newProductivityByHour = [...data.productivityByHour];
  newProductivityByHour[hour] = (newProductivityByHour[hour] * 0.9) + (1 * 0.1);
  
  // Update productivity by day
  const day = now.getDay();
  const newProductivityByDay = [...data.productivityByDay];
  newProductivityByDay[day] = (newProductivityByDay[day] * 0.9) + (1 * 0.1);
  
  // Update project multiplier
  const projectMultipliers = new Map(data.projectMultipliers);
  if (task.projectId) {
    const currentMult = projectMultipliers.get(task.projectId) || 1.0;
    const newMult = (currentMult * 0.8) + (accuracy * 0.2);
    projectMultipliers.set(task.projectId, Math.max(0.5, Math.min(2.5, newMult)));
  }
  
  // Update tag-based multipliers (using tags as categories)
  const categoryMultipliers = new Map(data.categoryMultipliers);
  for (const tag of task.tags || []) {
    const currentMult = categoryMultipliers.get(tag) || 1.0;
    const newMult = (currentMult * 0.8) + (accuracy * 0.2);
    categoryMultipliers.set(tag, Math.max(0.5, Math.min(2.5, newMult)));
  }
  
  // Update global multiplier
  const globalMultiplier = calculateGlobalMultiplier(records);
  
  // Find peak hours
  const peakHours = findPeakHours(newProductivityByHour);

  const newData: LearningData = {
    completionRecords: records,
    categoryMultipliers,
    projectMultipliers,
    globalMultiplier,
    productivityByHour: newProductivityByHour,
    productivityByDay: newProductivityByDay,
    peakHours,
    lastUpdated: new Date()
  };

  saveLearningData(newData);
  return newData;
}

// ============================================================================
// ESTIMATE ADJUSTMENT
// ============================================================================

/**
 * Adjust a time estimate based on learned patterns
 */
export function adjustEstimate(
  task: Task,
  data: LearningData
): AdjustedEstimate {
  const estimatedMinutes = task.estimatedMinutes || 60;
  let multiplier = data.globalMultiplier;
  let reason = 'Based on overall task completion history';
  let confidence = calculateConfidence(data.completionRecords.length);

  // Check tag-based multipliers (using first tag as category)
  const primaryTag = task.tags?.[0];
  if (primaryTag && data.categoryMultipliers.has(primaryTag)) {
    const categoryMult = data.categoryMultipliers.get(primaryTag)!;
    const categoryRecords = data.completionRecords.filter(
      r => r.tags?.includes(primaryTag)
    );
    
    if (categoryRecords.length >= 3) {
      multiplier = categoryMult;
      reason = `Based on ${categoryRecords.length} completed ${primaryTag} tasks`;
      confidence = calculateConfidence(categoryRecords.length);
    }
  }

  // Check project-specific multiplier
  if (task.projectId && data.projectMultipliers.has(task.projectId)) {
    const projectMult = data.projectMultipliers.get(task.projectId)!;
    const projectRecords = data.completionRecords.filter(
      r => r.projectId === task.projectId
    );
    
    if (projectRecords.length >= 3) {
      // Blend with category multiplier
      multiplier = (multiplier + projectMult) / 2;
      reason = `Based on project and tag history`;
      confidence = Math.max(confidence, calculateConfidence(projectRecords.length));
    }
  }

  const adjustedMinutes = Math.round(estimatedMinutes * multiplier);
  
  // Apply reasonable bounds
  const boundedMinutes = Math.max(15, Math.min(adjustedMinutes, estimatedMinutes * 3));

  return {
    adjustedMinutes: boundedMinutes,
    multiplier,
    confidence,
    reason
  };
}

/**
 * Get suggested buffer time for a task
 */
export function suggestBufferTime(
  task: Task,
  data: LearningData
): { bufferMinutes: number; reason: string } {
  const estimate = adjustEstimate(task, data);
  
  // If we typically underestimate, add more buffer
  if (estimate.multiplier > 1.2) {
    const primaryTag = task.tags?.[0] || 'similar';
    const bufferMinutes = Math.round((estimate.multiplier - 1) * (task.estimatedMinutes || 60) * 0.5);
    return {
      bufferMinutes: Math.max(15, Math.min(60, bufferMinutes)),
      reason: `Added buffer because ${primaryTag} tasks typically run over`
    };
  }

  // Standard buffer based on priority
  const priorityBuffers: Record<string, number> = {
    urgent: 30,
    high: 20,
    medium: 15,
    low: 10
  };

  return {
    bufferMinutes: priorityBuffers[task.priority] || 15,
    reason: 'Standard buffer for task priority'
  };
}

// ============================================================================
// INSIGHTS
// ============================================================================

/**
 * Get productivity insights
 */
export function getProductivityInsights(data: LearningData): ProductivityInsight[] {
  const insights: ProductivityInsight[] = [];

  if (data.completionRecords.length < 5) {
    return [{
      type: 'estimate_accuracy',
      title: 'Keep completing tasks',
      description: 'Complete more tasks to unlock personalized insights'
    }];
  }

  // Peak hours insight
  if (data.peakHours.length > 0) {
    const peakHourStr = data.peakHours.map(h => formatHour(h)).join(', ');
    insights.push({
      type: 'peak_hours',
      title: 'Your peak productivity hours',
      description: `You complete the most tasks around ${peakHourStr}`,
      recommendation: 'Schedule important work during these hours'
    });
  }

  // Best day insight
  const bestDay = data.productivityByDay.indexOf(Math.max(...data.productivityByDay));
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  if (data.productivityByDay[bestDay] > 0) {
    insights.push({
      type: 'best_day',
      title: 'Most productive day',
      description: `${dayNames[bestDay]} is your most productive day`,
      recommendation: 'Plan challenging tasks for this day'
    });
  }

  // Estimate accuracy insight
  if (data.globalMultiplier > 1.15) {
    const overBy = Math.round((data.globalMultiplier - 1) * 100);
    insights.push({
      type: 'estimate_accuracy',
      title: 'Tasks take longer than expected',
      description: `On average, tasks take ${overBy}% longer than estimated`,
      recommendation: 'The scheduler is automatically adjusting estimates'
    });
  } else if (data.globalMultiplier < 0.85) {
    const underBy = Math.round((1 - data.globalMultiplier) * 100);
    insights.push({
      type: 'estimate_accuracy',
      title: 'You\'re faster than expected!',
      description: `Tasks typically finish ${underBy}% faster than estimated`,
      recommendation: 'Great focus! Consider taking on more work'
    });
  }

  // Tag patterns
  for (const [tag, multiplier] of data.categoryMultipliers) {
    if (multiplier > 1.3) {
      insights.push({
        type: 'category_pattern',
        title: `${tag} tasks need more time`,
        description: `${tag} tasks typically take ${Math.round((multiplier - 1) * 100)}% longer`,
        recommendation: `Add extra buffer when planning ${tag} work`
      });
    }
  }

  return insights;
}

/**
 * Get recommended work hours based on productivity patterns
 */
export function getRecommendedWorkHours(data: LearningData): {
  start: string;
  end: string;
  reason: string;
} {
  if (data.peakHours.length < 2) {
    return {
      start: '09:00',
      end: '17:00',
      reason: 'Default hours - complete more tasks for personalized recommendation'
    };
  }

  // Find contiguous productive hours
  const productiveHours = data.productivityByHour
    .map((p, i) => ({ hour: i, productivity: p }))
    .filter(h => h.productivity > 0)
    .sort((a, b) => b.productivity - a.productivity);

  if (productiveHours.length === 0) {
    return {
      start: '09:00',
      end: '17:00',
      reason: 'Default hours'
    };
  }

  // Take top 8 hours
  const topHours = productiveHours.slice(0, 8).map(h => h.hour);
  const start = Math.min(...topHours);
  const end = Math.max(...topHours) + 1;

  return {
    start: `${String(start).padStart(2, '0')}:00`,
    end: `${String(end).padStart(2, '0')}:00`,
    reason: `Based on your productivity patterns from ${data.completionRecords.length} completed tasks`
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function calculateGlobalMultiplier(records: TaskCompletionRecord[]): number {
  if (records.length < 3) return 1.0;
  
  const recentRecords = records.slice(0, 30);
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (let i = 0; i < recentRecords.length; i++) {
    const record = recentRecords[i];
    const accuracy = record.estimatedMinutes > 0 
      ? record.actualMinutes / record.estimatedMinutes 
      : 1;
    
    const weight = 1 / (1 + i * 0.1); // Decay for older records
    totalWeight += weight;
    weightedSum += accuracy * weight;
  }
  
  const avgAccuracy = totalWeight > 0 ? weightedSum / totalWeight : 1;
  return Math.max(0.5, Math.min(2.0, avgAccuracy));
}

function calculateConfidence(sampleSize: number): number {
  if (sampleSize < 3) return 20;
  if (sampleSize < 5) return 40;
  if (sampleSize < 10) return 60;
  if (sampleSize < 20) return 80;
  return 95;
}

function findPeakHours(productivityByHour: number[]): number[] {
  const threshold = Math.max(...productivityByHour) * 0.7;
  return productivityByHour
    .map((p, i) => ({ hour: i, productivity: p }))
    .filter(h => h.productivity >= threshold && h.productivity > 0)
    .sort((a, b) => b.productivity - a.productivity)
    .slice(0, 3)
    .map(h => h.hour);
}

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

// ============================================================================
// EXPORT FOR SCHEDULER CONFIG
// ============================================================================

/**
 * Export learned patterns as scheduler hints
 */
export function exportAsSchedulerHints(data: LearningData): {
  recommendedWorkHours: { start: string; end: string };
  estimateMultiplier: number;
  peakProductivityHours: string[];
  categoryMultipliers: Record<string, number>;
} {
  const workHours = getRecommendedWorkHours(data);
  
  return {
    recommendedWorkHours: {
      start: workHours.start,
      end: workHours.end
    },
    estimateMultiplier: data.globalMultiplier,
    peakProductivityHours: data.peakHours.map(h => `${String(h).padStart(2, '0')}:00`),
    categoryMultipliers: Object.fromEntries(data.categoryMultipliers)
  };
}
