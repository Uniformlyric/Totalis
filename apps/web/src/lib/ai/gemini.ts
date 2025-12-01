/**
 * Gemini AI Service for Totalis
 * Handles natural language parsing, continuous chat, and intelligent item creation
 */

// Types for parsed items
export interface ParsedTask {
  type: 'task';
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string; // ISO string
  scheduledStart?: string;
  projectName?: string; // Will be matched to existing project or create new
  estimatedMinutes?: number;
  tags: string[];
}

export interface ParsedHabit {
  type: 'habit';
  title: string;
  description?: string;
  frequency: 'daily' | 'weekly' | 'custom';
  daysOfWeek?: number[]; // 0-6, Sunday-Saturday
  targetPerDay?: number;
  reminderTime?: string;
  color: string;
  tags: string[];
}

export interface ParsedProject {
  type: 'project';
  title: string;
  description?: string;
  deadline?: string;
  estimatedHours?: number;
  goalName?: string; // Will be matched to existing goal
  color?: string;
  tags: string[];
}

export interface ParsedGoal {
  type: 'goal';
  title: string;
  description?: string;
  deadline?: string;
  timeframe: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  targetValue?: number;
  unit?: string;
  color: string;
  tags: string[];
}

export type ParsedItem = ParsedTask | ParsedHabit | ParsedProject | ParsedGoal;

export interface ParseResult {
  items: ParsedItem[];
  message: string; // AI's conversational response
  suggestions?: string[]; // Follow-up suggestions
  clarificationNeeded?: boolean;
  clarificationQuestion?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  parsedItems?: ParsedItem[];
}

export interface ExistingTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  projectId?: string;
}

export interface ExistingHabit {
  id: string;
  title: string;
  frequency: string;
  currentStreak: number;
}

export interface ExistingProject {
  id: string;
  title: string;
  status: string;
  color?: string;
  deadline?: string;
}

export interface ExistingGoal {
  id: string;
  title: string;
  status: string;
  deadline?: string;
  progress: number;
}

export interface ChatContext {
  messages: ChatMessage[];
  pendingItems: ParsedItem[];
  existingTasks: ExistingTask[];
  existingHabits: ExistingHabit[];
  existingProjects: ExistingProject[];
  existingGoals: ExistingGoal[];
}

// Keyword definitions for priority elevation
const PRIORITY_KEYWORDS = {
  urgent: ['urgent', 'asap', 'emergency', 'critical', 'immediately', 'right now', 'today!'],
  high: ['important', 'high priority', 'priority', 'must', 'need to', 'essential', 'crucial'],
  medium: ['should', 'soon', 'this week', 'moderate'],
  low: ['maybe', 'someday', 'eventually', 'when possible', 'low priority', 'nice to have'],
};

// Color palette for auto-assignment
const COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
  '#0ea5e9', '#3b82f6', '#6366f1',
];

function getRandomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

// Build the system prompt
function buildSystemPrompt(context: ChatContext): string {
  // Format existing items for context
  const tasksList = context.existingTasks.length > 0
    ? context.existingTasks.slice(0, 20).map(t => 
        `- "${t.title}" (${t.status}, ${t.priority} priority${t.dueDate ? `, due ${t.dueDate}` : ''})`
      ).join('\n')
    : 'None';
  
  const habitsList = context.existingHabits.length > 0
    ? context.existingHabits.map(h => 
        `- "${h.title}" (${h.frequency}, ${h.currentStreak} day streak)`
      ).join('\n')
    : 'None';
  
  const projectsList = context.existingProjects.length > 0
    ? context.existingProjects.map(p => 
        `- "${p.title}" (${p.status}${p.deadline ? `, deadline ${p.deadline}` : ''})`
      ).join('\n')
    : 'None';
  
  const goalsList = context.existingGoals.length > 0
    ? context.existingGoals.map(g => 
        `- "${g.title}" (${g.status}, ${g.progress}% complete${g.deadline ? `, deadline ${g.deadline}` : ''})`
      ).join('\n')
    : 'None';

  const pendingItemsList = context.pendingItems.length > 0
    ? `\n\nPENDING ITEMS (in current session, can be modified):\n${JSON.stringify(context.pendingItems, null, 2)}`
    : '';

  return `You are a smart AI assistant for Totalis, a productivity app. You help users manage their tasks, habits, projects, and goals through natural conversation.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

====== USER'S EXISTING DATA ======

EXISTING TASKS (recent):
${tasksList}

EXISTING HABITS:
${habitsList}

EXISTING PROJECTS:
${projectsList}

EXISTING GOALS:
${goalsList}
${pendingItemsList}

====== CRITICAL RULES ======

1. **NEVER CREATE DUPLICATES**: Before creating any item, check if something similar already exists above. 
   - If user mentions "Complete Totalis App" and a goal/project "Complete Totalis App" exists, DO NOT create a new one.
   - If user mentions "workout" and a habit "Workout" exists, DO NOT create a new one.
   - Instead, acknowledge the existing item and ask if they want to update it.

2. **RECOGNIZE EXISTING ITEMS**: When user references something that exists:
   - Respond with "I see you already have [item]. Would you like me to update it instead?"
   - Or ask clarifying questions like "Did you mean your existing [item], or is this something new?"

3. **BE CONVERSATIONAL**: You're a personal assistant, not just a parser. 
   - Acknowledge what you understood
   - Ask clarifying questions when ambiguous
   - Offer helpful suggestions

4. **PRIORITY KEYWORDS** (elevate priority when detected):
   - URGENT: urgent, asap, emergency, critical, immediately
   - HIGH: important, priority, must, need to, essential
   - MEDIUM: should, soon, this week
   - LOW: maybe, someday, eventually, nice to have

====== RESPONSE FORMAT ======

Always respond with valid JSON:
{
  "items": [],  // ONLY new items that DON'T already exist
  "message": "Your conversational response",
  "suggestions": ["Optional helpful suggestions"],
  "existingItemsReferenced": [
    // If user mentioned existing items, list them here
    {"type": "habit", "title": "Workout", "suggestion": "update schedule"}
  ],
  "clarificationNeeded": false,
  "clarificationQuestion": null
}

====== ITEM SCHEMAS ======

Task: { "type": "task", "title": "string", "priority": "low|medium|high|urgent", "dueDate": "ISO date or null", "projectName": "optional", "estimatedMinutes": number, "tags": [] }

Habit: { "type": "habit", "title": "string", "frequency": "daily|weekly|custom", "daysOfWeek": [0-6], "reminderTime": "HH:MM or null", "color": "hex", "tags": [] }

Project: { "type": "project", "title": "string", "deadline": "ISO date or null", "estimatedHours": number, "goalName": "optional", "color": "hex", "tags": [] }

Goal: { "type": "goal", "title": "string", "deadline": "ISO date or null", "timeframe": "weekly|monthly|quarterly|yearly", "targetValue": number, "unit": "string", "color": "hex", "tags": [] }

====== EXAMPLES ======

User: "I need to finish the quarterly report by Friday"
- Check: Is there an existing task/project about "quarterly report"? 
- If NO existing match → Create new task
- If YES exists → "I see you already have a task 'Quarterly Report'. Should I update its due date to Friday?"

User: "Start exercising daily"
- Check: Is there an existing habit about "exercise/workout"?
- If NO → Create new habit
- If YES → "You already have a 'Workout' habit. Would you like to update its schedule instead?"

Remember: You are a SMART assistant. Don't blindly create - think first!`;
}

// Parse the AI response
function parseAIResponse(responseText: string): ParseResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        items: [],
        message: responseText,
        clarificationNeeded: true,
        clarificationQuestion: "I couldn't parse that properly. Could you rephrase?",
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate and clean up items
    const items: ParsedItem[] = (parsed.items || []).map((item: any) => {
      // Ensure required fields based on type
      switch (item.type) {
        case 'task':
          return {
            type: 'task',
            title: item.title || 'Untitled Task',
            description: item.description,
            priority: item.priority || 'medium',
            dueDate: item.dueDate,
            scheduledStart: item.scheduledStart,
            projectName: item.projectName,
            estimatedMinutes: item.estimatedMinutes,
            tags: item.tags || [],
          } as ParsedTask;
        
        case 'habit':
          return {
            type: 'habit',
            title: item.title || 'Untitled Habit',
            description: item.description,
            frequency: item.frequency || 'daily',
            daysOfWeek: item.daysOfWeek,
            targetPerDay: item.targetPerDay,
            reminderTime: item.reminderTime,
            color: item.color || getRandomColor(),
            tags: item.tags || [],
          } as ParsedHabit;
        
        case 'project':
          return {
            type: 'project',
            title: item.title || 'Untitled Project',
            description: item.description,
            deadline: item.deadline,
            estimatedHours: item.estimatedHours,
            goalName: item.goalName,
            color: item.color || getRandomColor(),
            tags: item.tags || [],
          } as ParsedProject;
        
        case 'goal':
          return {
            type: 'goal',
            title: item.title || 'Untitled Goal',
            description: item.description,
            deadline: item.deadline,
            timeframe: item.timeframe || 'monthly',
            targetValue: item.targetValue,
            unit: item.unit,
            color: item.color || getRandomColor(),
            tags: item.tags || [],
          } as ParsedGoal;
        
        default:
          return null;
      }
    }).filter(Boolean);

    return {
      items,
      message: parsed.message || "I've processed your input.",
      suggestions: parsed.suggestions,
      clarificationNeeded: parsed.clarificationNeeded || false,
      clarificationQuestion: parsed.clarificationQuestion,
    };
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    return {
      items: [],
      message: "I had trouble understanding that. Could you try rephrasing?",
      clarificationNeeded: true,
    };
  }
}

// Main chat function
export async function chatWithGemini(
  userMessage: string,
  context: ChatContext,
  apiKey: string
): Promise<ParseResult> {
  // Validate API key
  if (!apiKey || apiKey.length < 10) {
    console.error('Gemini API key is missing or invalid');
    return {
      items: [],
      message: "API key not configured. Please add PUBLIC_GEMINI_API_KEY to your .env file and restart the server.",
      clarificationNeeded: true,
    };
  }

  const systemPrompt = buildSystemPrompt(context);
  
  // Build conversation history - include system prompt as first user message for compatibility
  const conversationHistory: { role: string; parts: { text: string }[] }[] = [];
  
  // Add system prompt as first exchange
  conversationHistory.push({
    role: 'user',
    parts: [{ text: `System Instructions: ${systemPrompt}\n\nPlease acknowledge you understand and are ready to help.` }],
  });
  conversationHistory.push({
    role: 'model', 
    parts: [{ text: 'I understand. I\'m ready to help you capture tasks, habits, projects, and goals. I\'ll respond with JSON in the specified format. What would you like to add?' }],
  });
  
  // Add previous conversation messages
  context.messages.forEach(msg => {
    conversationHistory.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  });

  // Add current message
  conversationHistory.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  try {
    // Use gemini-2.0-flash with v1beta endpoint
    const modelName = 'gemini-2.0-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    console.log('[Gemini] Sending request to:', modelName);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: conversationHistory,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      
      // Parse error for better messaging
      try {
        const errorData = JSON.parse(errorText);
        const errorMessage = errorData.error?.message || 'Unknown error';
        
        if (response.status === 400 && errorMessage.includes('API key')) {
          return {
            items: [],
            message: "Invalid API key. Please check your PUBLIC_GEMINI_API_KEY in the .env file.",
            clarificationNeeded: true,
          };
        }
        if (response.status === 429) {
          return {
            items: [],
            message: "Rate limit exceeded. Please wait a moment and try again.",
            clarificationNeeded: true,
          };
        }
      } catch {
        // Ignore JSON parse error
      }
      
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Gemini] Response received');
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!responseText) {
      console.error('Empty response from Gemini:', data);
      return {
        items: [],
        message: "I received an empty response. Please try again.",
        clarificationNeeded: true,
      };
    }
    
    return parseAIResponse(responseText);
  } catch (error) {
    console.error('Gemini chat error:', error);
    return {
      items: [],
      message: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your internet connection and try again.`,
      clarificationNeeded: true,
    };
  }
}

// Quick single-shot parsing (for simple inputs)
export async function quickParse(
  input: string,
  context: { 
    tasks: ExistingTask[];
    habits: ExistingHabit[];
    projects: ExistingProject[]; 
    goals: ExistingGoal[];
  },
  apiKey: string
): Promise<ParseResult> {
  const chatContext: ChatContext = {
    messages: [],
    pendingItems: [],
    existingTasks: context.tasks,
    existingHabits: context.habits,
    existingProjects: context.projects,
    existingGoals: context.goals,
  };

  return chatWithGemini(input, chatContext, apiKey);
}
