<div align="center">

# ✨ Totalis

### **Total clarity. Total control. Total productivity.**

A comprehensive AI-powered productivity system that unifies task management, habit tracking, goal setting, focus sessions, and intelligent scheduling into one cohesive experience.

[![Astro](https://img.shields.io/badge/Astro-5.16-BC52EE?logo=astro&logoColor=white)](https://astro.build)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Firebase](https://img.shields.io/badge/Firebase-12.6-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![Gemini](https://img.shields.io/badge/Gemini_AI-2.0_Flash-4285F4?logo=google&logoColor=white)](https://ai.google.dev)

</div>

---

## 🎯 Overview

Totalis is designed for people who want a unified system to manage their productivity. Instead of juggling multiple apps for tasks, habits, notes, and goals, Totalis brings everything together with AI-powered intelligence that reduces manual data entry and provides actionable insights.

### Key Differentiators

- **🤖 AI Quick Capture** - Press `Ctrl+K` anywhere to add tasks, habits, goals, or notes using natural language
- **📊 Unified Analytics** - See your productivity patterns across all dimensions in one place
- **🔄 Real-time Sync** - Changes sync instantly across all devices via Firebase
- **🌙 Beautiful Themes** - Celestial (dark) and Sunset (light) themes with smooth transitions
- **📱 PWA Ready** - Install as an app on any device with offline support

---

## ✨ Features

### Core Modules

| Module | Description |
|--------|-------------|
| **📋 Tasks** | Priority-based task management with due dates, time estimates, project linking, and AI-powered time estimation |
| **🎯 Goals** | Long-term goal tracking with progress visualization, timeframes (weekly/monthly/quarterly/yearly), and project linkage |
| **📁 Projects** | Organize work into projects with deadlines, progress tracking, and automatic task aggregation |
| **✅ Habits** | Daily/weekly habit tracking with streaks, completion history, and color-coded visualization |
| **📅 Calendar** | Month/week/day views with task scheduling, habit tracking, and deadline visualization |
| **🧘 Focus Mode** | Pomodoro-style focus sessions with timer, break reminders, and session history |
| **📝 Notes** | Rich text notes with tagging, pinning, and linking to tasks/projects/goals |
| **📊 Analytics** | Comprehensive productivity insights with charts, trends, and habit streak analysis |
| **🗓️ Timeline** | Gantt-style timeline view of projects, tasks, and goals with navigation controls |
| **⚙️ Settings** | Theme selection, notification preferences, work schedule, and account management |

### AI Features (Gemini 2.0 Flash)

- **Natural Language Parsing** - "Add a task to finish the report by Friday" just works
- **Smart Recognition** - AI identifies if you're describing a task, habit, goal, or note
- **Duplicate Detection** - Recognizes existing items and can update them instead of creating duplicates
- **Context Awareness** - Knows your existing projects, goals, and habits for intelligent linking
- **Conversational Interface** - Chat naturally to add multiple items in one session

### Technical Features

- **Offline Support** - Service worker caches app for offline use
- **Push Notifications** - Browser push notifications for reminders (VAPID-based)
- **Real-time Sync** - Firestore real-time subscriptions keep data in sync
- **Responsive Design** - Works beautifully on desktop, tablet, and mobile
- **Keyboard Shortcuts** - Full keyboard navigation with `?` to view all shortcuts
- **Data Export** - Export all your data in JSON or CSV format
- **Onboarding Flow** - 6-step guided setup for new users

---

## 🛠️ Tech Stack

### Frontend (Web)

| Technology | Purpose |
|------------|---------|
| [Astro 5.16](https://astro.build) | Static site generation with islands architecture |
| [React 19](https://react.dev) | Interactive UI components |
| [TypeScript 5](https://typescriptlang.org) | Type-safe development |
| [Tailwind CSS 4](https://tailwindcss.com) | Utility-first styling with CSS custom properties |

### Backend & Services

| Technology | Purpose |
|------------|---------|
| [Firebase Auth](https://firebase.google.com/auth) | User authentication (email/password, Google) |
| [Cloud Firestore](https://firebase.google.com/firestore) | Real-time NoSQL database |
| [Firebase Cloud Messaging](https://firebase.google.com/messaging) | Push notifications |
| [Gemini 2.0 Flash](https://ai.google.dev) | AI natural language processing |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| [Cloudflare Pages](https://pages.cloudflare.com) | Edge hosting with global CDN |
| [Cloudflare Workers](https://workers.cloudflare.com) | Serverless edge functions (future) |

### Mobile (Planned)

| Technology | Purpose |
|------------|---------|
| [Flutter](https://flutter.dev) | Cross-platform mobile app |
| [Dart](https://dart.dev) | Mobile app language |

---

## 📁 Project Structure

```
totalis/
├── apps/
│   ├── web/                          # Astro + React web application
│   │   ├── public/
│   │   │   ├── icons/                # PWA icons (192x192, 512x512)
│   │   │   ├── manifest.json         # PWA manifest
│   │   │   ├── sw.js                 # Service worker
│   │   │   └── offline.html          # Offline fallback page
│   │   ├── scripts/
│   │   │   └── generate-icons.mjs    # Icon generation script
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ai/               # AI Quick Capture modal & provider
│   │   │   │   ├── analytics/        # Analytics charts & insights
│   │   │   │   ├── auth/             # Login, register components
│   │   │   │   ├── calendar/         # Calendar views (month/week/day)
│   │   │   │   ├── dashboard/        # Main dashboard
│   │   │   │   ├── focus/            # Focus mode timer
│   │   │   │   ├── goals/            # Goal management
│   │   │   │   ├── habits/           # Habit tracking
│   │   │   │   ├── layout/           # Main layout, sidebar, header
│   │   │   │   ├── notes/            # Notes management
│   │   │   │   ├── projects/         # Project management
│   │   │   │   ├── settings/         # User settings
│   │   │   │   ├── tasks/            # Task management
│   │   │   │   ├── timeline/         # Gantt timeline view
│   │   │   │   ├── onboarding/       # New user onboarding wizard
│   │   │   │   └── ui/               # Reusable UI components (EmptyState, Skeleton, etc.)
│   │   │   ├── layouts/
│   │   │   │   └── AppLayout.astro   # Base HTML layout
│   │   │   ├── lib/
│   │   │   │   ├── ai/
│   │   │   │   │   └── gemini.ts     # Gemini AI service
│   │   │   │   ├── firebase.ts       # Firebase initialization
│   │   │   │   ├── push.ts           # Push notification service
│   │   │   │   └── export.ts         # Data export service (JSON/CSV)
│   │   │   ├── pages/                # Astro pages (file-based routing)
│   │   │   └── styles/
│   │   │       └── global.css        # Global styles & theme variables
│   │   ├── astro.config.mjs          # Astro configuration
│   │   ├── tailwind.config.js        # Tailwind configuration
│   │   └── tsconfig.json             # TypeScript configuration
│   │
│   └── mobile/                       # Flutter mobile app (planned)
│       ├── lib/
│       │   └── main.dart             # App entry point
│       └── pubspec.yaml              # Flutter dependencies
│
├── packages/
│   └── shared/                       # Shared types & utilities
│       └── src/
│           └── types/
│               └── index.ts          # TypeScript type definitions
│
├── firebase/
│   ├── firestore.rules               # Firestore security rules
│   └── firestore.indexes.json        # Firestore indexes
│
├── .github/
│   └── workflows/                    # CI/CD pipelines
│
├── package.json                      # Root package.json (pnpm workspaces)
├── pnpm-workspace.yaml               # Workspace configuration
└── README.md                         # This file
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** - JavaScript runtime
- **pnpm** - Package manager (recommended) or npm
- **Firebase CLI** - For deployment (`npm install -g firebase-tools`)
- **Flutter SDK** - For mobile development (optional)

### Environment Variables

Create `apps/web/.env` with your credentials:

```env
# Firebase Configuration
PUBLIC_FIREBASE_API_KEY=your_api_key
PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
PUBLIC_FIREBASE_PROJECT_ID=your_project_id
PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
PUBLIC_FIREBASE_APP_ID=your_app_id

# Gemini AI
PUBLIC_GEMINI_API_KEY=your_gemini_api_key

# VAPID Keys for Web Push (generate with: npx web-push generate-vapid-keys)
PUBLIC_VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:your@email.com
```

### Installation

```bash
# Clone the repository
git clone https://github.com/Uniformlyric/Totalis.git
cd Totalis

# Install dependencies
pnpm install

# Start the development server
pnpm web

# Open http://localhost:4321
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm web` | Start web dev server at localhost:4321 |
| `pnpm web:build` | Build web app for production |
| `pnpm web:preview` | Preview production build locally |
| `pnpm web:deploy` | Deploy to Cloudflare Pages |
| `pnpm firebase:deploy` | Deploy all Firebase configuration |
| `pnpm firebase:rules` | Deploy Firestore security rules |
| `pnpm lint` | Run ESLint across all workspaces |
| `pnpm format` | Format code with Prettier |
| `pnpm typecheck` | Run TypeScript type checking |

---

## 🎨 Theming

Totalis includes two carefully designed themes:

### 🌙 Celestial (Dark)
Deep space-inspired dark theme with indigo/violet accents. Easy on the eyes for extended use.

### 🌅 Sunset (Light)
Warm, inviting light theme with excellent contrast and readability.

Themes are controlled via CSS custom properties and can be switched in Settings. The theme preference syncs to Firestore for cross-device consistency.

---

## ⌨️ Keyboard Shortcuts

Press `?` anywhere to view all keyboard shortcuts. Here are the main ones:

### Navigation
| Shortcut | Action |
|----------|--------|
| `G` then `H` | Go to Dashboard |
| `G` then `T` | Go to Tasks |
| `G` then `P` | Go to Projects |
| `G` then `G` | Go to Goals |
| `G` then `A` | Go to Habits |
| `G` then `C` | Go to Calendar |
| `G` then `N` | Go to Notes |
| `G` then `S` | Go to Settings |

### Actions
| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `⌘+K` | Open AI Quick Capture |
| `N` | Create new item |
| `F` | Start focus session |
| `Escape` | Close modals |

### AI
| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Send AI message |
| `?` | Show keyboard shortcuts |

---

## 🔒 Security

- **Authentication** - Firebase Auth with email/password and Google OAuth
- **Authorization** - Firestore security rules ensure users can only access their own data
- **Data Encryption** - All data encrypted in transit (HTTPS) and at rest (Firebase)
- **No Server Storage** - API keys are client-side only; sensitive operations use Firebase

---

## 📱 Progressive Web App (PWA)

Totalis is a fully-featured PWA:

- **Installable** - Add to home screen on any device
- **Offline Support** - Core app works without internet
- **Push Notifications** - Receive reminders and updates
- **Fast Loading** - Service worker caches assets for instant loads

---

## 🗺️ Roadmap

### Completed ✅
- [x] Task management with priorities, due dates, time estimates
- [x] Goal tracking with progress visualization
- [x] Project management with task aggregation
- [x] Habit tracking with streaks
- [x] Calendar views (month/week/day)
- [x] Focus mode with Pomodoro timer
- [x] Notes with rich text and linking
- [x] Analytics dashboard with charts
- [x] Timeline (Gantt) view
- [x] AI Quick Capture with Gemini
- [x] Dual themes (dark/light)
- [x] PWA with offline support
- [x] Push notifications infrastructure
- [x] Settings persistence to Firestore
- [x] Onboarding flow (6-step wizard for new users)
- [x] Empty state components with presets
- [x] Keyboard shortcuts modal (press `?`)
- [x] Loading skeleton components
- [x] Data export (JSON/CSV)

### Planned 📋
- [ ] Flutter mobile app
- [ ] Recurring tasks
- [ ] Task templates
- [ ] Team collaboration
- [ ] Calendar integrations (Google, Outlook)
- [ ] API for third-party integrations
- [ ] Advanced AI insights

---

## 🤝 Contributing

This is currently a private project. If you're interested in contributing, please reach out to the maintainer.

---

## 📄 License

**Private** - All rights reserved. © 2025

---

<div align="center">

**Built with ❤️ for productivity enthusiasts**

[Report Bug](https://github.com/Uniformlyric/Totalis/issues) · [Request Feature](https://github.com/Uniformlyric/Totalis/issues)

</div>
