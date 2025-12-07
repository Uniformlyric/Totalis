import { useState } from 'react';
import { Button, Input } from '@/components/ui';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Import dynamically to avoid SSR issues
      const { getAuthInstance } = await import('@/lib/firebase');
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      
      const auth = getAuthInstance();
      await signInWithEmailAndPassword(auth, email, password);
      
      // Redirect to dashboard
      window.location.href = '/';
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/invalid-credential') {
        setError('Invalid email or password');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError('An error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-2xl">T</span>
        </div>
        <h1 className="text-2xl font-bold text-text">Welcome back</h1>
        <p className="text-text-secondary mt-2">Sign in to continue to Totalis</p>
      </div>

      {/* Form */}
      <div className="bg-surface rounded-2xl p-6 border border-border">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm">
              {error}
            </div>
          )}

          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            leftIcon={
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            }
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            leftIcon={
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            }
          />

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-text-secondary">Remember me</span>
            </label>
            <a href="/forgot-password" className="text-primary hover:underline">
              Forgot password?
            </a>
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={isLoading}
          >
            Sign In
          </Button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-surface text-text-muted">or continue with</span>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-full"
          isLoading={isGoogleLoading}
          onClick={async () => {
            setIsGoogleLoading(true);
            setError('');
            try {
              const { getAuthInstance } = await import('@/lib/firebase');
              const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
              const { doc, setDoc, getDoc, Timestamp } = await import('firebase/firestore');
              const { getDb } = await import('@/lib/firebase');
              
              const auth = getAuthInstance();
              const provider = new GoogleAuthProvider();
              const result = await signInWithPopup(auth, provider);
              
              // Check if user document exists, create if not
              const db = getDb();
              const userRef = doc(db, 'users', result.user.uid);
              const userSnap = await getDoc(userRef);
              
              if (!userSnap.exists()) {
                const now = Timestamp.now();
                await setDoc(userRef, {
                  email: result.user.email,
                  displayName: result.user.displayName || 'User',
                  photoURL: result.user.photoURL,
                  fcmTokens: [],
                  webPushSubscriptions: [],
                  settings: {
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
                    workingDays: [1, 2, 3, 4, 5], // Mon-Fri
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  },
                  createdAt: now,
                  updatedAt: now,
                });
              }
              
              window.location.href = '/';
            } catch (err: any) {
              console.error('Google sign-in error:', err);
              if (err.code === 'auth/popup-closed-by-user') {
                // User closed the popup, don't show error
              } else if (err.code === 'auth/popup-blocked') {
                setError('Popup was blocked. Please allow popups for this site.');
              } else {
                setError('Failed to sign in with Google. Please try again.');
              }
            } finally {
              setIsGoogleLoading(false);
            }
          }}
          leftIcon={
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          }
        >
          Continue with Google
        </Button>
      </div>

      <p className="text-center text-text-secondary text-sm mt-6">
        Don't have an account?{' '}
        <a href="/register" className="text-primary hover:underline font-medium">
          Sign up
        </a>
      </p>
    </div>
  );
}
