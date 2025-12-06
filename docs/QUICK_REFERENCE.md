# 🚀 Totalis Quick Reference

Quick reference for development workflow, key files, and common tasks.

---

## 📁 Key File Locations

### Types & Interfaces
```
packages/shared/src/types/index.ts
```
- All TypeScript interfaces: Project, Milestone, Task, Goal, Habit, etc.
- Shared across web and mobile apps

### Database Operations
```
apps/web/src/lib/db/
├── milestones.ts    # NEW: Milestone CRUD + progress calculations
├── projects.ts      # Project CRUD
├── tasks.ts         # Task CRUD (updated with milestone support)
├── goals.ts         # Goal CRUD
├── habits.ts        # Habit CRUD
└── index.ts         # Export all modules
```

### AI System
```
apps/web/src/lib/ai/
└── gemini.ts        # Gemini 2.0 Flash integration
```

### Scheduling & Intelligence (To be created)
```
apps/web/src/lib/scheduling/
├── calculator.ts    # Smart date calculation (Phase 1.4)
└── capacity.ts      # Capacity visualization (Phase 2.2)
```

### Components
```
apps/web/src/components/
├── projects/        # Project management UI
├── tasks/           # Task management UI
├── timeline/        # Gantt-style timeline
├── calendar/        # Calendar views
└── ai/              # AI Quick Capture modal
```

### Firebase
```
firebase/
├── firestore.rules          # Security rules (includes milestones)
└── firestore.indexes.json   # Database indexes
```

---

## 🔧 Common Development Tasks

### Start Development Server
```powershell
pnpm web
# Opens at http://localhost:4321
```

### Build for Production
```powershell
pnpm web:build
```

### Deploy to Cloudflare Pages
```powershell
pnpm web:deploy
```

### Deploy Firestore Rules
```powershell
pnpm firebase:rules
```

### Type Checking
```powershell
pnpm typecheck
```

---

## 🗄️ Database Schema Quick Reference

### Firestore Collections

```
users/{userId}/
├── projects/{projectId}
├── milestones/{milestoneId}     # NEW
├── tasks/{taskId}
├── goals/{goalId}
├── habits/{habitId}
├── habitLogs/{logId}
├── notes/{noteId}
├── focusSessions/{sessionId}
└── dailyStats/{statsId}
```

### Milestone Document
```typescript
{
  id: string;
  projectId: string;
  userId: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  order: number;
  estimatedHours: number;
  actualHours: number;
  startDate?: Date;
  deadline?: Date;
  taskCount: number;
  completedTaskCount: number;
  progress: number; // 0-100
  dependencies: string[]; // milestone IDs
  createdAt: Date;
  updatedAt: Date;
}
```

### Task Document (Updated)
```typescript
{
  id: string;
  userId: string;
  projectId?: string;
  milestoneId?: string;  // NEW
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedMinutes: number;
  dueDate?: Date;
  scheduledStart?: Date;
  // ... other fields
}
```

---

## 🤖 AI System Prompt Structure

### Current Capabilities
- Natural language task/habit/project/goal creation
- Duplicate detection
- Existing item matching
- Priority keyword recognition
- Conversational follow-up

### Planned Enhancements (Phase 1.3)
- Structured project breakdown (3-7 milestones)
- Smart task estimation
- Dependency detection
- Timeline calculation based on capacity

---

## 📊 Progress Calculation Chain

```
Task Status Change
    ↓
Recalculate Milestone Progress
    ├─ Count completed tasks
    ├─ Calculate progress percentage
    ├─ Sum actual hours
    └─ Update milestone status
         ↓
Recalculate Project Progress
    ├─ Weighted by milestone estimated hours
    ├─ Update project progress
    └─ Update project status
```

---

## 🎯 User Settings Reference

Located in `UserSettings` interface:

```typescript
{
  theme: 'celestial' | 'sunset' | 'system';
  workingHours: { start: string; end: string };  // e.g., "09:00", "17:00"
  weeklyCapacity: number;  // hours per week available for work
  timezone: string;
  notifications: { ... };
}
```

**Used for:**
- Smart scheduling (Phase 1.4)
- Capacity warnings (Phase 2.2)
- Workload analysis (Phase 5.1)

---

## 🔐 Authentication Flow

1. User logs in via Firebase Auth (email/password or Google)
2. `auth.currentUser.uid` used as `userId` in all DB operations
3. Firestore rules enforce user-level data isolation
4. All queries filtered by `userId` automatically

---

## 🎨 Theming System

### CSS Variables
Located in `apps/web/src/styles/global.css`

```css
:root[data-theme="celestial"] {
  --color-primary: ...;
  --color-surface: ...;
}

:root[data-theme="sunset"] {
  --color-primary: ...;
  --color-surface: ...;
}
```

---

## 🧪 Testing Checklist

Before committing major changes:

- [ ] TypeScript compiles without errors (`pnpm typecheck`)
- [ ] All imports resolve correctly
- [ ] Firestore rules updated if new collections added
- [ ] Real-time listeners unsubscribe properly (no memory leaks)
- [ ] Progress calculations accurate (Task → Milestone → Project)
- [ ] UI responsive on mobile/tablet/desktop
- [ ] Works in both Celestial and Sunset themes

---

## 📝 Coding Conventions

### Naming
- **Components:** PascalCase (e.g., `MilestoneCard.tsx`)
- **Files:** camelCase (e.g., `milestones.ts`)
- **Functions:** camelCase (e.g., `createMilestone`)
- **Interfaces:** PascalCase (e.g., `Milestone`)

### Async/Await
Always use async/await, never raw promises:
```typescript
// ✅ Good
const task = await getTask(taskId);

// ❌ Avoid
getTask(taskId).then(task => { ... });
```

### Error Handling
```typescript
try {
  await createMilestone(data);
} catch (error) {
  console.error('Failed to create milestone:', error);
  // Show user-friendly error message
}
```

---

## 🔗 Important Links

- **Firebase Console:** https://console.firebase.google.com/project/totalis-b6f8a
- **GitHub Repo:** https://github.com/Uniformlyric/Totalis
- **Development Plan:** `docs/DEVELOPMENT_PLAN.md`
- **Progress Tracker:** `docs/PROGRESS.md`
- **Local Dev:** http://localhost:4321

---

## 💡 Pro Tips

1. **Real-time Sync:** Always use `subscribe*` functions in React components and unsubscribe in cleanup
2. **Progress Auto-update:** Milestone/Project progress updates automatically when tasks complete
3. **Batch Operations:** Use `createMilestones()` for multiple milestones to reduce DB writes
4. **Type Safety:** Import types from `@totalis/shared` for consistency
5. **Firestore Timestamps:** Use `Timestamp.now()` for server-side timestamps

---

**Last Updated:** December 6, 2025
