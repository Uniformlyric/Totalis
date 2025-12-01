import { useState, useEffect } from 'react';
import { Button, Input, Card } from '@/components/ui';
import type { User } from 'firebase/auth';

interface OnboardingModalProps {
  user: User;
  onComplete: () => void;
}

type Step = 'welcome' | 'goal' | 'habit' | 'task' | 'quickcapture' | 'complete';

const STEPS: Step[] = ['welcome', 'goal', 'habit', 'task', 'quickcapture', 'complete'];

export function OnboardingModal({ user, onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [isLoading, setIsLoading] = useState(false);
  
  // Form states
  const [goalTitle, setGoalTitle] = useState('');
  const [habitTitle, setHabitTitle] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  
  // Created item IDs for linking
  const [createdGoalId, setCreatedGoalId] = useState<string | null>(null);

  const stepIndex = STEPS.indexOf(currentStep);
  const progress = ((stepIndex) / (STEPS.length - 1)) * 100;

  const goNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  };

  const goBack = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  };

  const skip = () => {
    goNext();
  };

  const handleCreateGoal = async () => {
    if (!goalTitle.trim()) {
      goNext();
      return;
    }

    setIsLoading(true);
    try {
      const { getDb } = await import('@/lib/firebase');
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      const db = getDb();

      const goalRef = await addDoc(collection(db, 'goals'), {
        userId: user.uid,
        title: goalTitle.trim(),
        description: '',
        status: 'active',
        progress: 0,
        timeframe: 'quarterly',
        tags: [],
        color: '#6366f1',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setCreatedGoalId(goalRef.id);
      goNext();
    } catch (err) {
      console.error('Failed to create goal:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateHabit = async () => {
    if (!habitTitle.trim()) {
      goNext();
      return;
    }

    setIsLoading(true);
    try {
      const { getDb } = await import('@/lib/firebase');
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      const db = getDb();

      await addDoc(collection(db, 'habits'), {
        userId: user.uid,
        title: habitTitle.trim(),
        description: '',
        frequency: 'daily',
        currentStreak: 0,
        longestStreak: 0,
        totalCompletions: 0,
        color: '#10b981',
        tags: [],
        isArchived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      goNext();
    } catch (err) {
      console.error('Failed to create habit:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim()) {
      goNext();
      return;
    }

    setIsLoading(true);
    try {
      const { getDb } = await import('@/lib/firebase');
      const { collection, addDoc, serverTimestamp, Timestamp } = await import('firebase/firestore');
      const db = getDb();

      // Set due date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(17, 0, 0, 0);

      await addDoc(collection(db, 'tasks'), {
        userId: user.uid,
        title: taskTitle.trim(),
        description: '',
        status: 'pending',
        priority: 'medium',
        estimatedMinutes: 30,
        estimatedSource: 'manual',
        goalId: createdGoalId || null,
        dueDate: Timestamp.fromDate(tomorrow),
        blockedBy: [],
        blocking: [],
        reminders: [],
        tags: [],
        syncStatus: 'synced',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      goNext();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    // Mark onboarding as complete in Firestore
    try {
      const { getDb } = await import('@/lib/firebase');
      const { doc, setDoc } = await import('firebase/firestore');
      const db = getDb();

      await setDoc(doc(db, 'users', user.uid, 'settings', 'onboarding'), {
        completed: true,
        completedAt: new Date(),
      });

      onComplete();
    } catch (err) {
      console.error('Failed to save onboarding status:', err);
      onComplete();
    }
  };

  const displayName = user.displayName?.split(' ')[0] || 'there';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="h-1 bg-surface-hover rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-text-muted">
            <span>Getting Started</span>
            <span>{stepIndex + 1} of {STEPS.length}</span>
          </div>
        </div>

        <Card variant="bordered" className="p-8">
          {/* Welcome Step */}
          {currentStep === 'welcome' && (
            <div className="text-center space-y-6 animate-fade-in">
              <div className="text-6xl">👋</div>
              <div>
                <h1 className="text-2xl font-bold text-text">
                  Welcome to Totalis, {displayName}!
                </h1>
                <p className="text-text-secondary mt-2">
                  Let's set up your productivity system in just a few steps.
                </p>
              </div>
              <div className="bg-surface-hover rounded-lg p-4 text-left">
                <p className="text-sm text-text-secondary">
                  <span className="font-medium text-text">What we'll do:</span>
                </p>
                <ul className="mt-2 space-y-1 text-sm text-text-secondary">
                  <li>🎯 Set your first goal</li>
                  <li>✅ Create a daily habit</li>
                  <li>📋 Add your first task</li>
                  <li>🤖 Learn about AI Quick Capture</li>
                </ul>
              </div>
              <Button onClick={goNext} className="w-full">
                Let's Go! →
              </Button>
            </div>
          )}

          {/* Goal Step */}
          {currentStep === 'goal' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center">
                <div className="text-5xl mb-4">🎯</div>
                <h2 className="text-xl font-bold text-text">What's your main goal?</h2>
                <p className="text-text-secondary mt-1">
                  Think big - what do you want to achieve this quarter?
                </p>
              </div>
              <div>
                <Input
                  placeholder="e.g., Launch my side project, Get promoted, Learn Spanish..."
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-text-muted mt-2">
                  You can add more details later
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={skip} className="flex-1">
                  Skip for now
                </Button>
                <Button onClick={handleCreateGoal} isLoading={isLoading} className="flex-1">
                  {goalTitle.trim() ? 'Create Goal →' : 'Next →'}
                </Button>
              </div>
            </div>
          )}

          {/* Habit Step */}
          {currentStep === 'habit' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center">
                <div className="text-5xl mb-4">✅</div>
                <h2 className="text-xl font-bold text-text">Start a daily habit</h2>
                <p className="text-text-secondary mt-1">
                  Small, consistent actions lead to big results.
                </p>
              </div>
              <div>
                <Input
                  placeholder="e.g., Exercise 30 minutes, Read 20 pages, Meditate..."
                  value={habitTitle}
                  onChange={(e) => setHabitTitle(e.target.value)}
                  autoFocus
                />
                <div className="flex flex-wrap gap-2 mt-3">
                  {['Exercise', 'Read', 'Meditate', 'Journal', 'Learn'].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setHabitTitle(suggestion)}
                      className="px-3 py-1 text-sm bg-surface-hover text-text-secondary rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={goBack}>
                  ← Back
                </Button>
                <Button variant="ghost" onClick={skip} className="flex-1">
                  Skip
                </Button>
                <Button onClick={handleCreateHabit} isLoading={isLoading} className="flex-1">
                  {habitTitle.trim() ? 'Create Habit →' : 'Next →'}
                </Button>
              </div>
            </div>
          )}

          {/* Task Step */}
          {currentStep === 'task' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center">
                <div className="text-5xl mb-4">📋</div>
                <h2 className="text-xl font-bold text-text">What's on your plate today?</h2>
                <p className="text-text-secondary mt-1">
                  Add something you need to get done.
                </p>
              </div>
              <div>
                <Input
                  placeholder="e.g., Review project proposal, Call the bank, Buy groceries..."
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  autoFocus
                />
                {createdGoalId && goalTitle && (
                  <p className="text-xs text-primary mt-2">
                    ✓ This task will be linked to your goal: "{goalTitle}"
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={goBack}>
                  ← Back
                </Button>
                <Button variant="ghost" onClick={skip} className="flex-1">
                  Skip
                </Button>
                <Button onClick={handleCreateTask} isLoading={isLoading} className="flex-1">
                  {taskTitle.trim() ? 'Create Task →' : 'Next →'}
                </Button>
              </div>
            </div>
          )}

          {/* Quick Capture Step */}
          {currentStep === 'quickcapture' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center">
                <div className="text-5xl mb-4">🤖</div>
                <h2 className="text-xl font-bold text-text">Meet your AI assistant</h2>
                <p className="text-text-secondary mt-1">
                  Add anything using natural language.
                </p>
              </div>
              <div className="bg-surface-hover rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <kbd className="px-2 py-1 bg-background border border-border rounded text-sm font-mono">
                    Ctrl+K
                  </kbd>
                  <span className="text-text-secondary">or click the + button</span>
                </div>
                <p className="text-sm text-text-secondary">
                  Just type naturally:
                </p>
                <ul className="text-sm space-y-2 text-text-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">→</span>
                    "Add a task to finish the report by Friday"
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">→</span>
                    "I want to start a habit of drinking more water"
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-warning">→</span>
                    "Create a goal to save $5000 by December"
                  </li>
                </ul>
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={goBack}>
                  ← Back
                </Button>
                <Button onClick={goNext} className="flex-1">
                  Almost done! →
                </Button>
              </div>
            </div>
          )}

          {/* Complete Step */}
          {currentStep === 'complete' && (
            <div className="text-center space-y-6 animate-fade-in">
              <div className="text-6xl">🎉</div>
              <div>
                <h2 className="text-2xl font-bold text-text">You're all set!</h2>
                <p className="text-text-secondary mt-2">
                  Your productivity system is ready to go.
                </p>
              </div>
              <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg p-4 text-left">
                <p className="text-sm font-medium text-text mb-2">What you've created:</p>
                <ul className="text-sm space-y-1 text-text-secondary">
                  {goalTitle && <li>🎯 Goal: {goalTitle}</li>}
                  {habitTitle && <li>✅ Habit: {habitTitle}</li>}
                  {taskTitle && <li>📋 Task: {taskTitle}</li>}
                  {!goalTitle && !habitTitle && !taskTitle && (
                    <li className="text-text-muted">You can add items anytime with Ctrl+K</li>
                  )}
                </ul>
              </div>
              <Button onClick={handleComplete} className="w-full">
                Start Using Totalis ✨
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
