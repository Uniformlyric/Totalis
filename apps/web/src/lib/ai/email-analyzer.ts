/**
 * Email Analyzer - Uses Gemini AI to extract actionable items from emails
 */

import type { GmailEmail } from '@/lib/integrations/gmail';
import type { Task, Project } from '@totalis/shared';

const GEMINI_API_KEY = import.meta.env.PUBLIC_GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Extract sender name from email address string
 * Handles formats like "John Doe <john@example.com>" or "john@example.com"
 */
function extractSenderName(from: string): string {
  // Try to extract name from "Name <email>" format
  const nameMatch = from.match(/^([^<]+)\s*</);
  if (nameMatch) {
    return nameMatch[1].trim().replace(/"/g, '');
  }
  // Fallback to email before @
  const emailMatch = from.match(/([^@]+)@/);
  if (emailMatch) {
    return emailMatch[1].replace(/[._-]/g, ' ');
  }
  return from;
}

export type ActionItemType = 'task' | 'project' | 'goal' | 'habit' | 'note' | 'ignore';
export type UrgencyLevel = 'urgent' | 'high' | 'medium' | 'low';

export interface DiscoveredActionItem {
  id: string; // Unique ID for UI selection
  emailId: string;
  emailSubject: string;
  emailFrom: string;
  emailDate: Date;
  
  // For Settings page compatibility
  sourceSubject: string;
  senderName: string;
  deadline?: string;
  priority: 'high' | 'medium' | 'low';
  
  type: ActionItemType;
  title: string;
  description: string;
  urgency: UrgencyLevel;
  dueDate?: string; // ISO date string if found
  estimatedMinutes?: number;
  
  // For projects
  milestones?: Array<{
    title: string;
    tasks: string[];
  }>;
  
  // Reasoning from AI
  reasoning: string;
  confidence: number; // 0-100
  
  // Flags
  requiresResponse: boolean;
  hasDeadline: boolean;
  isRecurring: boolean;
  suggestedTags: string[];
}

export interface EmailAnalysisResult {
  items: DiscoveredActionItem[];
  emailsProcessed: number;
  skippedCount: number;
  summary: string;
}

/**
 * Analyze a batch of emails using Gemini AI
 */
export async function analyzeEmails(
  emails: GmailEmail[],
  existingItems: { tasks: Task[]; projects: Project[] }
): Promise<EmailAnalysisResult> {
  if (emails.length === 0) {
    return {
      items: [],
      emailsProcessed: 0,
      skippedCount: 0,
      summary: 'No emails to analyze',
    };
  }
  
  // Process emails in batches to avoid token limits
  const batchSize = 10;
  const allActionItems: DiscoveredActionItem[] = [];
  let skippedCount = 0;
  
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    
    try {
      const batchResult = await analyzeBatch(batch, existingItems.tasks, existingItems.projects);
      allActionItems.push(...batchResult.items);
      skippedCount += batchResult.skipped;
    } catch (error) {
      console.error(`Error analyzing batch ${i / batchSize + 1}:`, error);
    }
    
    // Rate limiting - wait between batches
    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return {
    items: allActionItems,
    emailsProcessed: emails.length,
    skippedCount,
    summary: generateSummary(allActionItems, emails.length, skippedCount),
  };
}

/**
 * Load existing tasks and projects to avoid duplicates
 */
export async function loadExistingItems(userId: string): Promise<{ tasks: Task[]; projects: Project[] }> {
  const { collection, getDocs, query, where, limit, orderBy } = await import('firebase/firestore');
  const { getDb } = await import('@/lib/firebase');
  
  const db = getDb();
  
  try {
    // Load recent tasks (last 100)
    const tasksQuery = query(
      collection(db, 'users', userId, 'tasks'),
      where('status', 'in', ['pending', 'in_progress', 'not_started']),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const tasksSnapshot = await getDocs(tasksQuery);
    const tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
    
    // Load active projects
    const projectsQuery = query(
      collection(db, 'users', userId, 'projects'),
      where('status', 'in', ['active', 'planning', 'not_started']),
      limit(50)
    );
    const projectsSnapshot = await getDocs(projectsQuery);
    const projects = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
    
    return { tasks, projects };
  } catch (error) {
    console.error('Failed to load existing items:', error);
    return { tasks: [], projects: [] };
  }
}

/**
 * Analyze a single batch of emails
 */
async function analyzeBatch(
  emails: GmailEmail[],
  existingTasks: Task[],
  existingProjects: Project[]
): Promise<{ items: DiscoveredActionItem[]; skipped: number }> {
  
  // Build context about existing items to avoid duplicates
  const existingTaskTitles = existingTasks.slice(0, 50).map(t => t.title).join(', ');
  const existingProjectTitles = existingProjects.slice(0, 20).map(p => p.title).join(', ');
  
  // Format emails for the prompt
  const emailsText = emails.map((email, idx) => `
---EMAIL ${idx + 1}---
ID: ${email.id}
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date.toISOString()}
Body:
${email.body}
---END EMAIL ${idx + 1}---
`).join('\n\n');
  
  const prompt = `You are an intelligent personal assistant analyzing emails to identify actionable items.

## YOUR TASK
Analyze the following emails and identify any actionable items that should be added to a productivity system. Be selective and precise - only extract items that genuinely require action.

## EXISTING ITEMS (to avoid duplicates)
Existing Tasks: ${existingTaskTitles || 'None'}
Existing Projects: ${existingProjectTitles || 'None'}

## ACTION ITEM TYPES
- **task**: A single actionable item (reply to email, complete form, make a call, etc.)
- **project**: Something that requires multiple steps/tasks over time
- **goal**: A longer-term objective mentioned (career goal, learning goal, etc.)
- **habit**: Something that should be done regularly
- **note**: Important information to remember but no action required
- **ignore**: Not actionable (newsletters, confirmations, social media, spam, etc.)

## URGENCY LEVELS
- **urgent**: Needs action within 24 hours, has explicit deadline, uses words like "ASAP", "urgent", "immediately"
- **high**: Needs action within 1 week, important but not critical
- **medium**: Standard priority, can be scheduled in the next 2 weeks
- **low**: Nice to do eventually, no time pressure

## ANALYSIS RULES
1. Skip automated notifications, newsletters, marketing emails, social media updates
2. Look for explicit action requests: "please", "can you", "need you to", "deadline", "by [date]"
3. Identify meetings that need preparation or follow-up
4. Extract deadlines when mentioned (convert to ISO date format YYYY-MM-DD)
5. Consider sender importance (work emails may be higher priority than personal)
6. Check if the action might already exist in the existing items
7. Be conservative - when in doubt, mark as "ignore"
8. For recurring requests, suggest as a habit

## EMAILS TO ANALYZE
${emailsText}

## RESPONSE FORMAT
Return valid JSON only, no markdown. Format:
{
  "items": [
    {
      "emailId": "original email id",
      "emailSubject": "original subject",
      "emailFrom": "sender email",
      "type": "task|project|goal|habit|note|ignore",
      "title": "Concise action title (imperative form, e.g., 'Review Q4 budget proposal')",
      "description": "Brief context from the email",
      "urgency": "urgent|high|medium|low",
      "dueDate": "YYYY-MM-DD if found, null otherwise",
      "estimatedMinutes": estimated time in minutes (15-480),
      "reasoning": "Why this is actionable and assigned this urgency",
      "confidence": 0-100,
      "requiresResponse": true/false,
      "hasDeadline": true/false,
      "isRecurring": true/false,
      "suggestedTags": ["tag1", "tag2"]
    }
  ],
  "skipped": number of emails marked as ignore
}

Return ONLY the JSON object. Extract ALL actionable items from all emails.`;

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2, // Low temperature for precise extraction
        topP: 0.8,
        maxOutputTokens: 4096,
      },
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to analyze emails');
  }
  
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  // Parse JSON response
  try {
    // Clean up response - remove markdown code blocks if present
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    }
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    
    const parsed = JSON.parse(jsonText.trim());
    
    // Map to our types and add email metadata
    const items: DiscoveredActionItem[] = (parsed.items || [])
      .filter((item: any) => item.type !== 'ignore')
      .map((item: any, index: number) => {
        const email = emails.find(e => e.id === item.emailId);
        const urgencyToPriority: Record<string, 'high' | 'medium' | 'low'> = {
          'urgent': 'high',
          'high': 'high',
          'medium': 'medium',
          'low': 'low',
        };
        return {
          id: `${item.emailId}-${index}-${Date.now()}`,
          emailId: item.emailId,
          emailSubject: item.emailSubject || email?.subject || '',
          emailFrom: item.emailFrom || email?.from || '',
          emailDate: email?.date || new Date(),
          sourceSubject: item.emailSubject || email?.subject || '',
          senderName: extractSenderName(item.emailFrom || email?.from || ''),
          priority: urgencyToPriority[item.urgency] || 'medium',
          deadline: item.dueDate || undefined,
          type: item.type,
          title: item.title,
          description: item.description,
          urgency: item.urgency,
          dueDate: item.dueDate,
          estimatedMinutes: item.estimatedMinutes || 30,
          reasoning: item.reasoning,
          confidence: item.confidence || 70,
          requiresResponse: item.requiresResponse || false,
          hasDeadline: item.hasDeadline || false,
          isRecurring: item.isRecurring || false,
          suggestedTags: item.suggestedTags || [],
          milestones: item.milestones,
        };
      });
    
    return {
      items,
      skipped: parsed.skipped || emails.length - items.length,
    };
  } catch (parseError) {
    console.error('Failed to parse AI response:', parseError, text);
    return { items: [], skipped: emails.length };
  }
}

/**
 * Generate summary of analysis results
 */
function generateSummary(
  items: DiscoveredActionItem[],
  totalEmails: number,
  skippedCount: number
): string {
  const taskCount = items.filter(i => i.type === 'task').length;
  const projectCount = items.filter(i => i.type === 'project').length;
  const goalCount = items.filter(i => i.type === 'goal').length;
  const habitCount = items.filter(i => i.type === 'habit').length;
  const noteCount = items.filter(i => i.type === 'note').length;
  
  const urgentCount = items.filter(i => i.urgency === 'urgent').length;
  const highCount = items.filter(i => i.urgency === 'high').length;
  
  const parts: string[] = [];
  
  if (taskCount > 0) parts.push(`${taskCount} task${taskCount > 1 ? 's' : ''}`);
  if (projectCount > 0) parts.push(`${projectCount} project${projectCount > 1 ? 's' : ''}`);
  if (goalCount > 0) parts.push(`${goalCount} goal${goalCount > 1 ? 's' : ''}`);
  if (habitCount > 0) parts.push(`${habitCount} habit${habitCount > 1 ? 's' : ''}`);
  if (noteCount > 0) parts.push(`${noteCount} note${noteCount > 1 ? 's' : ''}`);
  
  let summary = `Analyzed ${totalEmails} emails. `;
  
  if (parts.length === 0) {
    summary += 'No actionable items found.';
  } else {
    summary += `Found ${parts.join(', ')}.`;
    
    if (urgentCount > 0 || highCount > 0) {
      summary += ` ${urgentCount} urgent, ${highCount} high priority.`;
    }
  }
  
  if (skippedCount > 0) {
    summary += ` Skipped ${skippedCount} non-actionable emails.`;
  }
  
  return summary;
}

/**
 * Import discovered items to Totalis
 */
export async function importActionItems(
  items: DiscoveredActionItem[],
  userId: string
): Promise<{ imported: number; errors: string[] }> {
  const { createTask } = await import('@/lib/db/tasks');
  const { createProject } = await import('@/lib/db/projects');
  const { markEmailsAsProcessed } = await import('@/lib/integrations/gmail');
  
  let imported = 0;
  const errors: string[] = [];
  const processedEmailIds: string[] = [];
  
  for (const item of items) {
    try {
      if (item.type === 'task' || item.type === 'note') {
        await createTask({
          title: item.title,
          description: `${item.description}\n\n---\nImported from email: "${item.emailSubject}" from ${item.emailFrom}`,
          priority: item.urgency,
          status: 'pending',
          estimatedMinutes: item.estimatedMinutes || 30,
          estimatedSource: 'ai',
          dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
          tags: [...item.suggestedTags, 'from-email'],
          blockedBy: [],
          blocking: [],
          reminders: [],
        });
        imported++;
      } else if (item.type === 'project') {
        // Create project with tasks/milestones if provided
        await createProject({
          title: item.title,
          description: `${item.description}\n\n---\nImported from email: "${item.emailSubject}" from ${item.emailFrom}`,
          deadline: item.dueDate ? new Date(item.dueDate) : undefined,
          estimatedHours: Math.ceil((item.estimatedMinutes || 60) / 60),
          status: 'active',
          progress: 0,
          taskCount: 0,
          completedTaskCount: 0,
          milestoneCount: item.milestones?.length || 0,
          completedMilestoneCount: 0,
          actualHours: 0,
          tags: [...item.suggestedTags, 'from-email'],
        });
        imported++;
      }
      // Note: goals and habits would need their own creation functions
      
      processedEmailIds.push(item.emailId);
    } catch (error) {
      console.error(`Failed to import item "${item.title}":`, error);
      errors.push(`Failed to import "${item.title}": ${error}`);
    }
  }
  
  // Mark all emails as processed
  if (processedEmailIds.length > 0) {
    await markEmailsAsProcessed(userId, [...new Set(processedEmailIds)]);
  }
  
  return { imported, errors };
}
