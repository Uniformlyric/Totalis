# Totalis

**Total clarity. Total control. Total productivity.**

A comprehensive productivity system with web and mobile apps.

## Tech Stack

- **Web:** Astro + React + TypeScript + Tailwind CSS
- **Mobile:** Flutter + Dart
- **Backend:** Firebase (Firestore, Auth, FCM) + Cloudflare Workers
- **Hosting:** Cloudflare Pages
- **AI:** Google Gemini API (Gemini 2.0 Flash)

## Project Structure

```
totalis/
├── apps/
│   ├── web/                    # Astro + React web app
│   └── mobile/                 # Flutter mobile app
├── packages/
│   └── shared/                 # Shared types & constants
├── firebase/                   # Firebase configuration
├── docs/                       # Documentation
├── .github/workflows/          # CI/CD workflows
├── scripts/                    # Utility scripts
└── ...config files
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (or npm)
- Flutter SDK
- Firebase CLI

### Installation

```bash
# Install dependencies
pnpm install

# Run web app
pnpm web

# Run Flutter app
cd apps/mobile
flutter run
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm web` | Start web dev server |
| `pnpm web:build` | Build web for production |
| `pnpm web:deploy` | Deploy to Cloudflare Pages |
| `pnpm firebase:deploy` | Deploy Firebase config |
| `pnpm firebase:rules` | Deploy Firestore rules |
| `pnpm generate:vapid` | Generate VAPID keys for push notifications |
| `pnpm lint` | Lint all workspaces |
| `pnpm format` | Format code with Prettier |

## License

Private - All rights reserved.
