import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

function initializeFirebase(): FirebaseApp {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  return app;
}

export function getDb(): Firestore {
  if (!db) {
    const app = initializeFirebase();
    db = getFirestore(app);
    
    if (typeof window !== 'undefined') {
      enableIndexedDbPersistence(db).catch((err) => {
        console.warn('Offline persistence error:', err.code);
      });
    }
  }
  return db;
}

export function getAuthInstance(): Auth {
  if (!auth) {
    const app = initializeFirebase();
    auth = getAuth(app);
  }
  return auth;
}

export async function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  
  const supported = await isSupported();
  if (supported) {
    const app = initializeFirebase();
    return getMessaging(app);
  }
  return null;
}
