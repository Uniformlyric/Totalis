# 🚀 Totalis Development Plan - Life Organization System

**Last Updated:** December 6, 2025  
**Goal:** Transform Totalis into an airtight, perfect life organization system with intelligent project management, smart scheduling, and Gmail integration.

---

## 📋 Table of Contents

1. [Current State Assessment](#current-state-assessment)
2. [Core Enhancement Objectives](#core-enhancement-objectives)
3. [Phase 1: Smart Projects & Tasks](#phase-1-smart-projects--tasks)
4. [Phase 2: Timeline Enhancement](#phase-2-timeline-enhancement)
5. [Phase 3: Calendar Functionality](#phase-3-calendar-functionality)
6. [Phase 4: Gmail Integration](#phase-4-gmail-integration)
7. [Phase 5: AI Intelligence Layer](#phase-5-ai-intelligence-layer)
8. [Implementation Timeline](#implementation-timeline)
9. [Progress Tracking](#progress-tracking)

---

## 🎯 Current State Assessment

### ✅ What's Working (MVP Features)
- ✅ Task management with priorities, due dates, time estimates
- ✅ Goal tracking with progress visualization
- ✅ Project management with basic task aggregation
- ✅ Habit tracking with streaks
- ✅ Calendar views (month/week/day) - **needs functionality enhancement**
- ✅ Focus mode with Pomodoro timer
- ✅ Notes with linking capabilities
- ✅ Analytics dashboard with charts
- ✅ Timeline (Gantt) view - **needs enhancement for smart scheduling**
- ✅ AI Quick Capture (Gemini 2.0 Flash) - **needs project/milestone intelligence**
- ✅ Dual themes, PWA support, push notifications
- ✅ Firebase Auth & Firestore real-time sync

### ⚠️ What Needs Enhancement
- ⚠️ **Projects lack milestone/subtask breakdown** - AI creates flat projects without steps
- ⚠️ **No intelligent date calculation** - Start dates and deadlines are manual or basic
- ⚠️ **Timeline is read-only visualization** - Not functional for scheduling/adjustments
- ⚠️ **Calendar lacks interactivity** - Can't drag/drop, reschedule, or manage capacity
- ⚠️ **No email integration** - Can't capture tasks/projects from Gmail
- ⚠️ **Limited AI context** - AI doesn't consider workload, capacity, dependencies

### 🆕 What's Missing
- 🆕 Project milestone system
- 🆕 Task dependency management (already in types, not implemented)
- 🆕 Intelligent scheduling algorithm
- 🆕 Workload capacity planning
- 🆕 Interactive timeline with drag-to-reschedule
- 🆕 Calendar time blocking and task scheduling
- 🆕 Gmail API integration
- 🆕 Email-to-task/project parsing
- 🆕 Smart deadline calculation based on workload

---

## 🎯 Core Enhancement Objectives

### 1. **Smart Project Creation**
**Goal:** AI creates structured projects with milestones and tasks, not flat lists.

**Requirements:**
- Projects automatically break down into 3-7 milestones
- Each milestone contains actionable tasks
- Tasks have intelligent estimates based on complexity
- Dependencies are automatically identified
- Progress rolls up: Task → Milestone → Project

### 2. **Intelligent Scheduling**
**Goal:** System calculates realistic start dates and deadlines based on workload.

**Requirements:**
- Consider user's weekly capacity (already in UserSettings: `weeklyCapacity`)
- Account for working hours (already in UserSettings: `workingHours`)
- Factor in existing commitments (tasks, focus sessions)
- Automatically schedule new projects to fit available time
- Warn when capacity is exceeded
- Suggest optimal start dates for new projects

### 3. **Interactive Timeline**
**Goal:** Timeline becomes a functional scheduling tool, not just visualization.

**Requirements:**
- Drag-and-drop to reschedule projects/tasks
- Visual capacity indicators (overbooked days in red)
- Milestone markers on timeline
- Click to edit project/task details
- Zoom in/out (week/month/quarter views already exist)
- Dependency lines between tasks
- Auto-adjust dependent tasks when parent moves

### 4. **Functional Calendar**
**Goal:** Calendar becomes primary scheduling interface with time blocking.

**Requirements:**
- Drag-and-drop tasks onto calendar days
- Time blocking with hour-by-hour view
- Capacity warnings (too many hours scheduled)
- Quick reschedule via drag
- Visual distinction: scheduled vs unscheduled tasks
- Integration with focus sessions
- Habit tracking on calendar days

### 5. **Gmail Integration**
**Goal:** Seamlessly capture tasks/projects from email without leaving inbox.

**Requirements:**
- OAuth 2.0 Gmail API integration
- Browser extension OR web-based Gmail add-on
- One-click "Add to Totalis" from email
- AI parses email content for task/project details
- Automatically extracts: title, description, due date, priority
- Links task back to original email
- Bi-directional sync: update task → update email label
- Smart detection: meeting requests → calendar events + prep tasks

---

## 🏗️ Phase 1: Smart Projects & Tasks

**Duration:** 2-3 weeks  
**Priority:** HIGH (Foundation for everything else)

### 1.1 Add Milestone Type
**Files to modify:**
- `packages/shared/src/types/index.ts`

```typescript
export interface Milestone {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  order: number; // 1, 2, 3... for sequence
  estimatedHours: number;
  actualHours: number;
  startDate?: Date;
  deadline?: Date;
  completedAt?: Date;
  taskCount: number;
  completedTaskCount: number;
  progress: number; // 0-100, calculated from tasks
  dependencies: string[]; // milestone IDs
  createdAt: Date;
  updatedAt: Date;
}
```

**Implementation Steps:**
- [x] Define Milestone interface in types
- [ ] Create `apps/web/src/lib/db/milestones.ts` (CRUD operations)
- [ ] Add Firestore collection: `milestones`
- [ ] Add security rules for milestones in `firebase/firestore.rules`
- [ ] Update Project interface to include `milestoneCount`

### 1.2 Update Task to Link to Milestones
**Files to modify:**
- `packages/shared/src/types/index.ts`

```typescript
export interface Task {
  // ... existing fields
  projectId?: string;
  milestoneId?: string; // NEW: Link to milestone
  goalId?: string;
  // ... rest of fields
}
```

**Implementation Steps:**
- [ ] Add `milestoneId` to Task interface
- [ ] Update task creation to accept milestone
- [ ] Update task queries to filter by milestone
- [ ] Update progress calculation to roll up to milestone

### 1.3 Enhance AI to Create Structured Projects
**Files to modify:**
- `apps/web/src/lib/ai/gemini.ts`

**New AI Capabilities:**
```typescript
export interface ParsedProject {
  type: 'project';
  title: string;
  description?: string;
  deadline?: string;
  estimatedHours?: number;
  goalName?: string;
  color?: string;
  tags: string[];
  milestones: ParsedMilestone[]; // NEW
}

export interface ParsedMilestone {
  title: string;
  description?: string;
  estimatedHours: number;
  order: number;
  tasks: ParsedTask[];
}
```

**AI Prompt Enhancement:**
```
When user creates a project, ALWAYS break it down into:
1. 3-7 logical milestones (phases/stages)
2. Each milestone contains 2-10 actionable tasks
3. Calculate estimated hours for each task based on complexity
4. Identify dependencies between tasks
5. Suggest a realistic timeline based on:
   - Total estimated hours
   - User's weekly capacity: {weeklyCapacity} hours
   - Current workload: {currentWeeklyHours} hours scheduled
   - Working hours: {workingHours.start} to {workingHours.end}

Example Project Structure:
Project: "Launch Personal Website"
├─ Milestone 1: "Planning & Design" (8 hours)
│  ├─ Task: Research competitor websites (2h)
│  ├─ Task: Sketch wireframes (3h)
│  └─ Task: Choose color palette (1h)
├─ Milestone 2: "Development" (20 hours)
│  ├─ Task: Set up React project (2h)
│  ├─ Task: Build homepage (6h)
│  └─ Task: Create about page (4h)
└─ Milestone 3: "Launch" (6 hours)
   ├─ Task: Deploy to hosting (2h)
   └─ Task: Test on devices (2h)
```

**Implementation Steps:**
- [ ] Update system prompt with project breakdown instructions
- [ ] Add milestone parsing to `parseAIResponse()`
- [ ] Create `createProjectWithMilestones()` function
- [ ] Update AI Quick Capture modal to show milestone preview
- [ ] Add UI to show/collapse milestones in project view

### 1.4 Smart Date Calculation Algorithm
**New file:** `apps/web/src/lib/scheduling/calculator.ts`

```typescript
interface SchedulingContext {
  userWeeklyCapacity: number; // hours per week
  workingHours: { start: string; end: string };
  existingTasks: Task[];
  existingProjects: Project[];
  holidays: Date[]; // optional
}

interface SchedulingResult {
  suggestedStartDate: Date;
  calculatedDeadline: Date;
  weeklyHoursRequired: number;
  isOverCapacity: boolean;
  warnings: string[];
  breakdown: {
    week: string; // ISO week
    hoursScheduled: number;
    tasksScheduled: Task[];
  }[];
}

export function calculateOptimalSchedule(
  projectTasks: Task[],
  context: SchedulingContext
): SchedulingResult {
  // Algorithm:
  // 1. Calculate total hours needed
  // 2. Get currently scheduled hours per week
  // 3. Find weeks with available capacity
  // 4. Distribute tasks across available weeks
  // 5. Account for dependencies (must schedule after parent)
  // 6. Return suggested start date and realistic deadline
}
```

**Implementation Steps:**
- [ ] Create scheduling calculator module
- [ ] Implement capacity calculation
- [ ] Implement date suggestion algorithm
- [ ] Add dependency resolution
- [ ] Create UI warnings for overbooked weeks
- [ ] Integrate with AI project creation

### 1.5 Project Creation UI Enhancement
**Files to modify:**
- `apps/web/src/components/projects/ProjectModal.tsx`
- `apps/web/src/components/projects/ProjectPage.tsx`

**New Components:**
- `MilestoneList.tsx` - Show collapsible milestones
- `MilestoneCard.tsx` - Individual milestone with tasks
- `ProjectTimeline.tsx` - Mini timeline in project detail view

**Implementation Steps:**
- [ ] Add milestone expansion/collapse to project view
- [ ] Show task count per milestone
- [ ] Add progress bar per milestone
- [ ] Display calculated dates with "Smart" badge
- [ ] Add "Recalculate Schedule" button
- [ ] Show capacity warnings in project creation

---

## 📊 Phase 2: Timeline Enhancement

**Duration:** 2-3 weeks  
**Priority:** HIGH

### 2.1 Make Timeline Interactive
**Files to modify:**
- `apps/web/src/components/timeline/TimelinePage.tsx`

**New Features:**
- Drag-and-drop bars to reschedule
- Click bar to edit project/task
- Visual capacity indicators
- Milestone markers
- Dependency lines

**Implementation Steps:**
- [ ] Install drag-and-drop library (e.g., `@dnd-kit/core`)
- [ ] Add drag handlers to `TimelineBar` component
- [ ] Implement date update on drop
- [ ] Add capacity calculation per day/week
- [ ] Color-code days: green (available), yellow (busy), red (overbooked)
- [ ] Add milestone diamond markers on timeline
- [ ] Draw dependency lines between connected tasks
- [ ] Add zoom controls (already has view modes, make more granular)

### 2.2 Capacity Visualization
**New file:** `apps/web/src/lib/scheduling/capacity.ts`

```typescript
export interface DayCapacity {
  date: string;
  totalMinutesScheduled: number;
  availableMinutes: number;
  utilizationPercentage: number;
  status: 'available' | 'busy' | 'overbooked';
  tasks: Task[];
}

export function calculateDayCapacity(
  date: Date,
  tasks: Task[],
  workingHours: { start: string; end: string }
): DayCapacity {
  // Calculate available work minutes for the day
  // Sum scheduled task minutes
  // Determine utilization and status
}
```

**Implementation Steps:**
- [ ] Create capacity calculation module
- [ ] Add capacity bars to timeline days
- [ ] Color-code timeline background by capacity
- [ ] Show tooltip with breakdown on hover
- [ ] Add filter: "Show only overbooked days"

### 2.3 Milestone Markers on Timeline
**Implementation Steps:**
- [ ] Query milestones for visible projects
- [ ] Add `MilestoneMarker` component (diamond shape)
- [ ] Position based on milestone deadline
- [ ] Show tooltip with milestone details
- [ ] Click to jump to project detail

### 2.4 Dependency Visualization
**Implementation Steps:**
- [ ] Query task dependencies for visible tasks
- [ ] Draw SVG lines connecting dependent tasks
- [ ] Use arrow to show direction (A blocks B)
- [ ] Add legend: "This task is blocked by [task]"
- [ ] Highlight dependency chain on hover

---

## 📅 Phase 3: Calendar Functionality

**Duration:** 2-3 weeks  
**Priority:** HIGH

### 3.1 Add Time Blocking View
**Files to modify:**
- `apps/web/src/components/calendar/CalendarView.tsx`

**New View Mode:** Hour-by-hour day view (7am - 10pm)

**Implementation Steps:**
- [ ] Add "Day" view tab (already exists, enhance it)
- [ ] Create hour grid (15-minute increments)
- [ ] Show scheduled tasks in time slots
- [ ] Show focus sessions in time slots
- [ ] Display habits at scheduled times
- [ ] Add capacity indicator per hour
- [ ] Color-code hours by utilization

### 3.2 Drag-and-Drop Task Scheduling
**Implementation Steps:**
- [ ] Add unscheduled tasks sidebar
- [ ] Drag task onto calendar day → set `scheduledStart`
- [ ] Drag task onto hour slot → set `scheduledStart` with time
- [ ] Drag existing task to new day → update `scheduledStart`
- [ ] Show visual feedback during drag (ghost element)
- [ ] Validate capacity before allowing drop
- [ ] Show warning if dropping would overbook

### 3.3 Quick Task Creation from Calendar
**Implementation Steps:**
- [ ] Click empty time slot → open quick task modal
- [ ] Pre-fill `scheduledStart` with clicked time
- [ ] AI can still parse task details
- [ ] Save and immediately show on calendar

### 3.4 Integration with Focus Mode
**Implementation Steps:**
- [ ] Show scheduled focus sessions on calendar
- [ ] Click task → "Start Focus Session" button
- [ ] Auto-block time when focus session starts
- [ ] Update actual minutes when session completes

### 3.5 Calendar Filters and Views
**Implementation Steps:**
- [ ] Filter by project (show only Project X tasks)
- [ ] Filter by priority (show only high/urgent)
- [ ] Toggle habits on/off
- [ ] Toggle focus sessions on/off
- [ ] "Only show unscheduled tasks" filter

---

## 📧 Phase 4: Gmail Integration

**Duration:** 4-6 weeks  
**Priority:** MEDIUM-HIGH (Game changer for life organization)

### 4.1 Architecture Decision

**Option A: Browser Extension (Recommended)**
- ✅ Direct Gmail integration
- ✅ Add button to Gmail interface
- ✅ Works in browser tab
- ❌ Requires separate extension development
- ❌ User must install extension

**Option B: Web-based Gmail Add-on**
- ✅ No installation required
- ✅ Google Workspace Marketplace distribution
- ❌ More restricted API access
- ❌ Complex approval process

**Option C: Web App with Gmail API**
- ✅ No separate extension
- ✅ Full control over UI
- ❌ User must switch between tabs
- ❌ Can't modify Gmail interface

**RECOMMENDED: Option A (Browser Extension) for best UX**

### 4.2 Gmail API Integration

#### 4.2.1 Google Cloud Setup
**Steps:**
1. Create Google Cloud Project: "Totalis Gmail Integration"
2. Enable Gmail API
3. Create OAuth 2.0 credentials
4. Add scopes:
   - `https://www.googleapis.com/auth/gmail.readonly` (read emails)
   - `https://www.googleapis.com/auth/gmail.modify` (add labels)
   - `https://www.googleapis.com/auth/gmail.labels` (create labels)

#### 4.2.2 OAuth Flow Implementation
**New file:** `apps/web/src/lib/gmail/auth.ts`

```typescript
export async function initiateGmailAuth(): Promise<void> {
  // Use Google Identity Services for OAuth
  // Store access token in Firestore (encrypted)
  // Handle token refresh
}

export async function getGmailAuthStatus(userId: string): Promise<boolean> {
  // Check if user has connected Gmail
}
```

#### 4.2.3 Email Fetching
**New file:** `apps/web/src/lib/gmail/client.ts`

```typescript
export interface GmailEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string[];
  date: Date;
  snippet: string;
  body: string;
  labels: string[];
  hasAttachments: boolean;
}

export async function fetchEmails(
  userId: string,
  query?: string
): Promise<GmailEmail[]> {
  // Fetch emails from Gmail API
  // Default query: "is:unread OR is:starred"
}

export async function fetchEmailById(
  userId: string,
  emailId: string
): Promise<GmailEmail> {
  // Fetch single email details
}
```

#### 4.2.4 Email-to-Task Parsing
**New file:** `apps/web/src/lib/gmail/parser.ts`

```typescript
export interface EmailTaskSuggestion {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: Date;
  projectName?: string;
  tags: string[];
  confidence: number; // 0-100
}

export async function parseEmailForTask(
  email: GmailEmail,
  geminiApiKey: string
): Promise<EmailTaskSuggestion> {
  // Use Gemini AI to extract task details from email
  // Prompt: "Extract actionable task from this email..."
  // Look for dates, urgency keywords, project references
}

export async function parseEmailForProject(
  email: GmailEmail,
  geminiApiKey: string
): Promise<ParsedProject | null> {
  // Detect if email describes a multi-step project
  // Extract milestones and tasks
}
```

**AI Prompt for Email Parsing:**
```
Analyze this email and extract actionable task information:

Subject: {subject}
From: {from}
Date: {date}
Body: {body}

Extract:
1. Task title (concise, actionable)
2. Description (key details)
3. Priority (based on urgency keywords, deadline proximity)
4. Due date (parse from email content: "by Friday", "next week", etc.)
5. Project (if email references existing project or is multi-step)
6. Tags (categorize based on content)
7. Confidence (0-100): how confident are you this is a real task?

Return JSON:
{
  "title": "...",
  "description": "...",
  "priority": "medium",
  "dueDate": "2025-12-10",
  "projectName": null,
  "tags": ["email", "client"],
  "confidence": 85
}

If confidence < 50, return null (not a clear task).
```

#### 4.2.5 Browser Extension Development
**New directory:** `apps/gmail-extension/`

**Structure:**
```
apps/gmail-extension/
├── manifest.json           # Chrome extension manifest
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.tsx          # React popup component
│   └── popup.css
├── content/
│   ├── content.ts         # Inject button into Gmail
│   └── content.css
├── background/
│   ├── background.ts      # Service worker
│   └── api.ts             # API calls to Totalis web app
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── tsconfig.json
```

**manifest.json:**
```json
{
  "manifest_version": 3,
  "name": "Totalis - Gmail Integration",
  "version": "1.0.0",
  "description": "Capture tasks and projects from Gmail",
  "permissions": [
    "storage",
    "identity"
  ],
  "host_permissions": [
    "https://mail.google.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://mail.google.com/*"],
      "js": ["content.js"],
      "css": ["content.css"]
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify"
    ]
  }
}
```

**Content Script (`content.ts`):**
```typescript
// Inject "Add to Totalis" button into Gmail interface
function injectTotalisButton() {
  // Find email toolbar
  const toolbar = document.querySelector('.G-atb');
  if (!toolbar) return;

  // Create button
  const button = document.createElement('button');
  button.className = 'totalis-add-btn';
  button.innerHTML = '📋 Add to Totalis';
  button.onclick = handleAddToTotalis;

  toolbar.appendChild(button);
}

async function handleAddToTotalis() {
  // Extract email data from DOM
  const subject = document.querySelector('h2.hP')?.textContent;
  const from = document.querySelector('.gD')?.getAttribute('email');
  const body = document.querySelector('.a3s')?.textContent;

  // Send to background script
  chrome.runtime.sendMessage({
    type: 'ADD_EMAIL_TO_TOTALIS',
    email: { subject, from, body }
  });
}
```

**Background Service Worker (`background.ts`):**
```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ADD_EMAIL_TO_TOTALIS') {
    handleEmailCapture(message.email);
  }
});

async function handleEmailCapture(email: any) {
  // Call Totalis API to create task from email
  const response = await fetch('https://totalis.app/api/gmail/create-task', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getAuthToken()}`
    },
    body: JSON.stringify({ email })
  });

  // Show notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: 'Task Created',
    message: 'Email added to Totalis'
  });
}
```

#### 4.2.6 Totalis Web App API Endpoint
**New file:** `apps/web/src/pages/api/gmail/create-task.ts`

```typescript
// Astro API endpoint
export async function post({ request }) {
  const { email } = await request.json();
  const authToken = request.headers.get('Authorization');

  // Verify auth token
  const userId = await verifyToken(authToken);

  // Parse email with AI
  const taskSuggestion = await parseEmailForTask(email, GEMINI_API_KEY);

  // Create task in Firestore
  const taskId = await createTask({
    userId,
    ...taskSuggestion,
    metadata: {
      source: 'gmail',
      emailId: email.id,
      emailSubject: email.subject
    }
  });

  return new Response(JSON.stringify({ taskId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

#### 4.2.7 Gmail Settings in Totalis
**New file:** `apps/web/src/components/settings/GmailSettings.tsx`

**Features:**
- Connect/disconnect Gmail account
- Choose default project for email tasks
- Set auto-label rules (add "Totalis" label to processed emails)
- Configure auto-import: starred emails, specific labels
- Sync frequency settings

#### 4.2.8 Email Reference in Tasks
**Update Task interface:**
```typescript
export interface Task {
  // ... existing fields
  metadata?: {
    source?: 'manual' | 'gmail' | 'ai';
    gmailEmailId?: string;
    gmailThreadId?: string;
    gmailSubject?: string;
  };
}
```

**Task Detail View Enhancement:**
- Show "View Email" button if task came from Gmail
- Open Gmail thread in new tab
- Show email snippet in task description

### 4.3 Implementation Checklist

#### Gmail API Setup
- [ ] Create Google Cloud Project
- [ ] Enable Gmail API
- [ ] Create OAuth 2.0 credentials
- [ ] Add authorized redirect URIs
- [ ] Set up OAuth consent screen

#### Backend Integration
- [ ] Create `lib/gmail/auth.ts` (OAuth flow)
- [ ] Create `lib/gmail/client.ts` (API calls)
- [ ] Create `lib/gmail/parser.ts` (AI parsing)
- [ ] Add API endpoint: `api/gmail/create-task`
- [ ] Add API endpoint: `api/gmail/sync`
- [ ] Store Gmail tokens in Firestore (encrypted)
- [ ] Add User field: `gmailConnected: boolean`

#### Browser Extension
- [ ] Set up extension project structure
- [ ] Create manifest.json
- [ ] Build content script (inject button)
- [ ] Build background service worker
- [ ] Build popup UI (React)
- [ ] Implement OAuth in extension
- [ ] Add icon assets
- [ ] Test in Chrome
- [ ] Test in Firefox (optional)

#### UI Integration
- [ ] Add Gmail settings page
- [ ] Add "Connect Gmail" button in settings
- [ ] Show Gmail sync status in header
- [ ] Add "Import from Gmail" button in tasks page
- [ ] Display email icon on tasks created from Gmail
- [ ] Add "View Email" link in task detail
- [ ] Create Gmail inbox widget in dashboard

#### Testing
- [ ] Test OAuth flow
- [ ] Test email parsing accuracy (50+ sample emails)
- [ ] Test task creation from extension
- [ ] Test label syncing
- [ ] Test token refresh
- [ ] Test error handling (no internet, API errors)

---

## 🤖 Phase 5: AI Intelligence Layer

**Duration:** 3-4 weeks  
**Priority:** HIGH (Makes everything else "smart")

### 5.1 Workload Analysis
**New file:** `apps/web/src/lib/ai/workload-analyzer.ts`

**AI-Powered Insights:**
```typescript
export interface WorkloadAnalysis {
  currentWeeklyHours: number;
  availableWeeklyHours: number;
  utilizationPercentage: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  insights: string[];
  warnings: string[];
  suggestions: string[];
}

export async function analyzeWorkload(
  userId: string,
  geminiApiKey: string
): Promise<WorkloadAnalysis> {
  // Fetch user's tasks, projects, focus sessions
  // Calculate current workload
  // Use AI to provide insights and suggestions
}
```

**AI Prompt:**
```
Analyze this user's workload:
- Weekly capacity: {weeklyCapacity} hours
- Currently scheduled: {scheduledHours} hours this week
- Upcoming deadlines: {upcomingDeadlines}
- Recent completion rate: {completionRate}%

Provide:
1. Utilization assessment (underbooked/balanced/overbooked)
2. 3-5 actionable insights
3. Specific warnings (e.g., "Project X deadline is unrealistic")
4. Suggestions (e.g., "Reschedule Task Y to next week")
```

### 5.2 Intelligent Rescheduling
**New file:** `apps/web/src/lib/ai/auto-scheduler.ts`

```typescript
export interface ReschedulingOptions {
  respectDeadlines: boolean;
  respectDependencies: boolean;
  minimizeOvertime: boolean;
  preferMornings: boolean;
}

export async function suggestReschedule(
  overdueTasks: Task[],
  context: SchedulingContext,
  options: ReschedulingOptions
): Promise<ReschedulingPlan> {
  // Use AI + algorithm to suggest optimal task rescheduling
  // Consider: deadlines, dependencies, capacity, user preferences
}
```

### 5.3 Proactive Notifications
**Enhancement to existing push notification system:**

**Smart Notifications:**
- "You have 3 hours of free time today. Want to tackle Task X?"
- "Project Y deadline is in 2 days, but you have 8 hours of work left. Reschedule?"
- "You've completed 10 tasks this week! 🎉 Take a break?"
- "Morning Summary: 4 tasks scheduled today (3h estimated)"
- "Warning: This week is overbooked by 12 hours. Adjust schedule?"

**Implementation:**
- [ ] Create `lib/notifications/smart-notifications.ts`
- [ ] Add Cloud Function trigger: daily morning summary
- [ ] Add Cloud Function trigger: evening recap
- [ ] Add Cloud Function trigger: capacity warnings
- [ ] Add Cloud Function trigger: achievement celebrations

### 5.4 AI-Powered Dashboard Widgets
**New Widgets:**
- **Capacity Gauge:** Visual progress bar showing weekly utilization
- **Smart Suggestions:** AI-generated tasks based on goals (e.g., "Consider adding 'Research competitors' to Website Project")
- **Deadline Alerts:** Projects/tasks at risk with suggested actions
- **Efficiency Score:** AI calculates productivity score based on completion rate, estimate accuracy
- **Next Best Action:** AI recommends what to work on next

---

## 📅 Implementation Timeline

### Month 1: Foundation
| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Phase 1.1-1.2 | Milestone type, task linking |
| 2 | Phase 1.3 | AI project breakdown |
| 3 | Phase 1.4 | Smart date calculation |
| 4 | Phase 1.5 | Enhanced project UI |

### Month 2: Visualization
| Week | Focus | Deliverables |
|------|-------|--------------|
| 5 | Phase 2.1 | Interactive timeline |
| 6 | Phase 2.2-2.3 | Capacity + milestones |
| 7 | Phase 3.1-3.2 | Calendar time blocking |
| 8 | Phase 3.3-3.5 | Calendar features |

### Month 3: Gmail Integration
| Week | Focus | Deliverables |
|------|-------|--------------|
| 9 | Phase 4.1-4.2 | Gmail API setup |
| 10 | Phase 4.2.5 | Browser extension MVP |
| 11 | Phase 4.2.6-4.2.7 | API endpoints + settings |
| 12 | Phase 4.3 | Testing + polish |

### Month 4: Intelligence
| Week | Focus | Deliverables |
|------|-------|--------------|
| 13 | Phase 5.1 | Workload analysis |
| 14 | Phase 5.2 | Auto-scheduling |
| 15 | Phase 5.3-5.4 | Smart notifications + widgets |
| 16 | Testing + Polish | Bug fixes, UX refinement |

---

## 📊 Progress Tracking

### Phase 1: Smart Projects & Tasks
- [ ] **1.1** Milestone type added
- [ ] **1.2** Task-milestone linking
- [ ] **1.3** AI creates structured projects
- [ ] **1.4** Smart date calculation
- [ ] **1.5** Enhanced project UI

### Phase 2: Timeline Enhancement
- [ ] **2.1** Interactive timeline
- [ ] **2.2** Capacity visualization
- [ ] **2.3** Milestone markers
- [ ] **2.4** Dependency visualization

### Phase 3: Calendar Functionality
- [ ] **3.1** Time blocking view
- [ ] **3.2** Drag-and-drop scheduling
- [ ] **3.3** Quick task creation
- [ ] **3.4** Focus mode integration
- [ ] **3.5** Calendar filters

### Phase 4: Gmail Integration
- [ ] **4.1** Architecture decision (Browser Extension)
- [ ] **4.2.1** Google Cloud setup
- [ ] **4.2.2** OAuth flow
- [ ] **4.2.3** Email fetching
- [ ] **4.2.4** Email-to-task parsing
- [ ] **4.2.5** Browser extension development
- [ ] **4.2.6** API endpoints
- [ ] **4.2.7** Gmail settings UI
- [ ] **4.2.8** Email reference in tasks
- [ ] **4.3** Full integration testing

### Phase 5: AI Intelligence Layer
- [ ] **5.1** Workload analysis
- [ ] **5.2** Intelligent rescheduling
- [ ] **5.3** Proactive notifications
- [ ] **5.4** AI dashboard widgets

---

## 🎯 Success Criteria

### Must Have (Airtight & Perfect)
✅ **Zero manual scheduling** - AI calculates all dates  
✅ **No overbooked weeks** - System warns and prevents  
✅ **Visual capacity management** - Always know workload status  
✅ **Email inbox zero** - Every email becomes a task or is dismissed  
✅ **Dependency awareness** - Can't complete B before A  
✅ **Milestone tracking** - Know exactly where you are in each project  
✅ **Smart suggestions** - AI proactively helps prioritize  
✅ **Seamless Gmail sync** - One-click from email to task  

### Quality Metrics
- **AI Accuracy:** >90% correct task extraction from emails
- **Scheduling Accuracy:** Deadlines within 10% of actual completion
- **User Efficiency:** 50% reduction in manual task entry
- **System Reliability:** 99.9% uptime, <1s response time

---

## 🚀 Next Steps

1. **Review this plan** - Discuss and refine priorities
2. **Set up GitHub Project Board** - Create issues for each checklist item
3. **Begin Phase 1.1** - Start with Milestone type definition
4. **Weekly progress reviews** - Update this doc every Friday
5. **Iterate based on usage** - Adjust plan as you use the system

---

**Last Updated:** December 6, 2025  
**Document Owner:** Development Team  
**Status:** 🟡 Planning Complete - Ready for Implementation
