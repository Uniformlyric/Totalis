import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAuthInstance } from '@/lib/firebase';
import {
  subscribeToHabits,
  createHabit,
  updateHabit,
  deleteHabit,
  updateStreaks,
} from '@/lib/db/habits';
import {
  subscribeToHabitLogsForDate,
  toggleHabitCompletion,
  getDateString,
} from '@/lib/db/habitLogs';
import { HabitCard } from './HabitCard';
import { HabitModal } from './HabitModal';
import { FloatingAddButton } from '@/components/tasks/FloatingAddButton';
import type { Habit, HabitLog } from '@totalis/shared';

export function HabitsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [todayLogs, setTodayLogs] = useState<HabitLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');

  const today = getDateString();

  // Auth state listener
  useEffect(() => {
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to habits and today's logs
  useEffect(() => {
    if (!authChecked || !user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const unsubHabits = subscribeToHabits(user.uid, (updatedHabits) => {
      // Filter to only active (non-archived) habits
      setHabits(updatedHabits.filter((h) => !h.isArchived));
      setIsLoading(false);
    });

    const unsubLogs = subscribeToHabitLogsForDate(user.uid, today, (logs) => {
      setTodayLogs(logs);
    });

    return () => {
      unsubHabits();
      unsubLogs();
    };
  }, [user, authChecked, today]);

  const handleCreateHabit = () => {
    setSelectedHabit(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleHabitClick = (habit: Habit) => {
    setSelectedHabit(habit);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleSaveHabit = async (habitData: Partial<Habit>) => {
    if (!user) return;

    if (modalMode === 'create') {
      await createHabit({
        ...habitData,
        title: habitData.title || 'Untitled Habit',
        frequency: habitData.frequency || 'daily',
        color: habitData.color || '#22c55e',
        tags: habitData.tags || [],
        isArchived: false,
      } as Omit<Habit, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'currentStreak' | 'longestStreak' | 'totalCompletions'>);
    } else if (selectedHabit?.id) {
      await updateHabit(selectedHabit.id, habitData);
    }
  };

  const handleDeleteHabit = async (habitId: string) => {
    await deleteHabit(habitId);
  };

  const handleToggleHabit = async (habitId: string) => {
    const { completed } = await toggleHabitCompletion(habitId, today);
    
    // Update streaks based on completion
    await updateStreaks(habitId, completed);
  };

  const isHabitCompletedToday = (habitId: string) => {
    const log = todayLogs.find((l) => l.habitId === habitId);
    return log?.completed === true;
  };

  // Calculate stats
  const completedToday = habits.filter((h) => isHabitCompletedToday(h.id)).length;
  const totalActiveHabits = habits.length;
  const completionRate = totalActiveHabits > 0
    ? Math.round((completedToday / totalActiveHabits) * 100)
    : 0;
  const totalStreak = habits.reduce((sum, h) => sum + h.currentStreak, 0);

  // Show login prompt if not authenticated
  if (authChecked && !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-surface flex items-center justify-center">
            <span className="text-4xl">🔥</span>
          </div>
          <h2 className="text-2xl font-bold text-text mb-2">Sign in to track habits</h2>
          <p className="text-text-secondary mb-6">
            Build lasting habits with streaks and daily check-ins
          </p>
          <a
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 font-medium rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-text mb-2">Habits</h1>
        <p className="text-text-secondary">
          Build consistency with daily habits and track your streaks
        </p>
      </div>

      {/* Today's Date */}
      <div className="mb-6">
        <div className="text-lg font-medium text-text">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </div>
      </div>

      {/* Stats */}
      {!isLoading && habits.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-surface rounded-xl p-4">
            <div className="text-2xl font-bold text-text">
              {completedToday}/{totalActiveHabits}
            </div>
            <div className="text-sm text-text-secondary">Done Today</div>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <div className="text-2xl font-bold text-success">{completionRate}%</div>
            <div className="text-sm text-text-secondary">Completion</div>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <div className="text-2xl font-bold text-warning flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L8.5 11H2L6.5 15L4.5 22L12 17L19.5 22L17.5 15L22 11H15.5L12 2Z" />
              </svg>
              {totalStreak}
            </div>
            <div className="text-sm text-text-secondary">Total Streak Days</div>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <div className="text-2xl font-bold text-primary">
              {habits.reduce((sum, h) => sum + h.totalCompletions, 0)}
            </div>
            <div className="text-sm text-text-secondary">All-Time Completions</div>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {!isLoading && habits.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-text-secondary">Today's Progress</span>
            <span className="font-medium text-text">
              {completedToday} of {totalActiveHabits} habits
            </span>
          </div>
          <div className="h-3 bg-surface-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-success to-primary rounded-full transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && habits.length === 0 && (
        <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl p-8 mb-8 text-center border border-primary/20">
          <span className="text-5xl mb-4 block">🌱</span>
          <h2 className="text-xl font-bold text-text mb-2">
            Start building good habits
          </h2>
          <p className="text-text-secondary mb-4 max-w-md mx-auto">
            Track your daily habits and watch your streaks grow.
            Small consistent actions lead to big results.
          </p>
          <button
            onClick={handleCreateHabit}
            className="inline-flex items-center justify-center px-6 py-3 font-medium rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Your First Habit
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-surface rounded-xl p-4 h-24" />
          ))}
        </div>
      )}

      {/* Habits List */}
      {!isLoading && habits.length > 0 && (
        <div className="space-y-3">
          {habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              isCompletedToday={isHabitCompletedToday(habit.id)}
              onToggle={handleToggleHabit}
              onClick={() => handleHabitClick(habit)}
            />
          ))}
        </div>
      )}

      {/* Floating Add Button */}
      <FloatingAddButton onClick={handleCreateHabit} label="New Habit" />

      {/* Habit Modal */}
      <HabitModal
        habit={selectedHabit}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveHabit}
        onDelete={handleDeleteHabit}
        mode={modalMode}
      />
    </div>
  );
}
