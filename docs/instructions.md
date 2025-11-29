# Totalis Instructions

## Development

### Run Web App

```bash
cd C:\Totalis\apps\web
npm run dev
```

Or from root:
```bash
npm run web
```

The app will be available at http://localhost:4321

### Run Flutter App

```bash
cd C:\Totalis\apps\mobile
flutter run
```

## Firebase Setup (First Time)

### Step 1: Create Firebase Project

1. Go to **https://console.firebase.google.com/**
2. Click **"Create a project"**
3. Enter project name: `Totalis`
4. Disable Google Analytics (optional)
5. Click **"Create project"** and wait

### Step 2: Enable Authentication

1. In Firebase console → **"Authentication"** in sidebar
2. Click **"Get started"**
3. Click **"Email/Password"**
4. Toggle **"Enable"** on → **"Save"**

### Step 3: Create Firestore Database

1. Click **"Firestore Database"** in sidebar
2. Click **"Create database"**
3. Choose **"Start in test mode"**
4. Select closest location (e.g., `us-central1`)
5. Click **"Enable"**

### Step 4: Get Web App Config

1. Click ⚙️ gear icon → **"Project settings"**
2. Scroll to **"Your apps"** section
3. Click web icon (`</>`) to add web app
4. Enter nickname: `Totalis Web`
5. **Don't** check Firebase Hosting
6. Click **"Register app"**
7. Copy the `firebaseConfig` values

### Step 5: Set Environment Variables

Edit `apps/web/.env` with your Firebase values:

```bash
PUBLIC_FIREBASE_API_KEY=AIzaSy...
PUBLIC_FIREBASE_AUTH_DOMAIN=totalis-xxxxx.firebaseapp.com
PUBLIC_FIREBASE_PROJECT_ID=totalis-xxxxx
PUBLIC_FIREBASE_STORAGE_BUCKET=totalis-xxxxx.appspot.com
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef...
```

### Step 6: Deploy Firebase Rules (Optional - for production)

```bash
cd C:\Totalis
firebase login
firebase init  # Select Firestore, choose existing project
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### Environment Variables Reference

Copy `.env.example` to `.env` in `apps/web/` and fill in your Firebase project values:

```bash
# Firebase
PUBLIC_FIREBASE_API_KEY=your-api-key
PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
PUBLIC_FIREBASE_PROJECT_ID=your-project-id
PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
PUBLIC_FIREBASE_APP_ID=your-app-id

# Gemini AI
GEMINI_API_KEY=your-gemini-api-key

# VAPID (Web Push)
PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@yourdomain.com

# Cloudflare
CLOUDFLARE_ACCOUNT_ID=
```

## PWA Icons

Generate PWA icons from the favicon:

```bash
cd C:\Totalis\apps\web\public
npx pwa-asset-generator favicon.svg icons --icon-only
```

Or use https://realfavicongenerator.net/

## Project Structure

```
apps/web/src/
├── components/
│   ├── ui/           # Button, Card, Input, Modal, Badge, etc.
│   ├── layout/       # MainLayout, Sidebar, Header
│   ├── dashboard/    # Dashboard components
│   └── auth/         # LoginForm, RegisterForm
├── layouts/          # Astro layouts (BaseLayout, AppLayout, AuthLayout)
├── pages/            # Astro pages (all routes)
├── hooks/            # React hooks (useAuth, useTasks)
├── stores/           # Zustand stores (themeStore, taskStore)
├── lib/              # Firebase, DB operations
│   ├── firebase.ts
│   └── db/
└── styles/           # Global CSS with theme variables
```

## Themes

- **Celestial (Dark)**: Default theme with deep blue/purple tones
- **Sunset (Light)**: Warm orange/cream light theme
- **System**: Follows OS preference

Toggle themes in Settings or use:
```javascript
localStorage.setItem('totalis-theme', 'celestial' | 'sunset' | 'system');
```
