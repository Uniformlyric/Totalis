import { useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { getAuthInstance, getDb } from '@/lib/firebase';
import type { User as TotalisUser, UserSettings } from '@totalis/shared';

const defaultSettings: UserSettings = {
  theme: 'celestial',
  notifications: {
    morningSummary: { enabled: true, time: '08:00' },
    eveningRecap: { enabled: true, time: '21:00' },
    urgentReminders: true,
    gentleReminders: true,
    emailNotifications: true,
    pushNotifications: true,
  },
  workingHours: { start: '09:00', end: '17:00' },
  weeklyCapacity: 40,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [totalisUser, setTotalisUser] = useState<TotalisUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        const db = getDb();
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          setTotalisUser({ id: userSnap.id, ...userSnap.data() } as TotalisUser);
        }
      } else {
        setTotalisUser(null);
      }
      
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    const auth = getAuthInstance();
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const auth = getAuthInstance();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Create user document
    const db = getDb();
    const userRef = doc(db, 'users', credential.user.uid);
    const now = Timestamp.now();
    
    await setDoc(userRef, {
      email,
      displayName,
      fcmTokens: [],
      webPushSubscriptions: [],
      settings: defaultSettings,
      createdAt: now,
      updatedAt: now,
    });
    
    return credential;
  };

  const signOut = async () => {
    const auth = getAuthInstance();
    return firebaseSignOut(auth);
  };

  return {
    user,
    totalisUser,
    loading,
    signIn,
    signUp,
    signOut,
    isAuthenticated: !!user,
  };
}
