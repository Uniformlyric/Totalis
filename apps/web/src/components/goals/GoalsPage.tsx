import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAuthInstance } from '@/lib/firebase';
import { subscribeToGoals, createGoal, updateGoal, deleteGoal } from '@/lib/db';
import { subscribeToProjects } from '@/lib/db';
import { GoalList } from './GoalList';
import { GoalModal } from './GoalModal';
import { FloatingAddButton } from '@/components/tasks/FloatingAddButton';
import type { Goal, Project } from '@totalis/shared';

export function GoalsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');

  // Auth state listener
  useEffect(() => {
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to goals and projects
  useEffect(() => {
    if (!authChecked || !user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const unsubGoals = subscribeToGoals(user.uid, (updatedGoals) => {
      setGoals(updatedGoals);
      setIsLoading(false);
    });

    const unsubProjects = subscribeToProjects(user.uid, (updatedProjects) => {
      setProjects(updatedProjects);
    });

    return () => {
      unsubGoals();
      unsubProjects();
    };
  }, [user, authChecked]);

  const handleCreateGoal = () => {
    setSelectedGoal(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleGoalClick = (goal: Goal) => {
    setSelectedGoal(goal);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleSaveGoal = async (goalData: Partial<Goal>) => {
    if (!user) return;

    if (modalMode === 'create') {
      await createGoal({
        ...goalData,
        userId: user.uid,
        title: goalData.title || 'Untitled Goal',
        status: goalData.status || 'active',
        timeframe: goalData.timeframe || 'monthly',
        progress: goalData.progress || 0,
      } as Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>);
    } else if (selectedGoal?.id) {
      await updateGoal(selectedGoal.id, goalData);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    await deleteGoal(goalId);
  };

  // Calculate goal statistics
  const activeGoals = goals.filter((g) => g.status === 'active');
  const completedGoals = goals.filter((g) => g.status === 'completed');
  const avgProgress = activeGoals.length > 0
    ? Math.round(activeGoals.reduce((sum, g) => sum + g.progress, 0) / activeGoals.length)
    : 0;

  // Show login prompt if not authenticated
  if (authChecked && !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-surface flex items-center justify-center">
            <span className="text-4xl">🎯</span>
          </div>
          <h2 className="text-2xl font-bold text-text mb-2">Sign in to view goals</h2>
          <p className="text-text-secondary mb-6">
            Set meaningful goals and track your progress over time
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text mb-2">Goals</h1>
        <p className="text-text-secondary">
          Set meaningful goals and track your progress towards achieving them
        </p>
      </div>

      {/* Goal Stats */}
      {!isLoading && goals.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-surface rounded-xl p-4">
            <div className="text-2xl font-bold text-text">{goals.length}</div>
            <div className="text-sm text-text-secondary">Total Goals</div>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <div className="text-2xl font-bold text-success">
              {activeGoals.length}
            </div>
            <div className="text-sm text-text-secondary">Active</div>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <div className="text-2xl font-bold text-primary">
              {completedGoals.length}
            </div>
            <div className="text-sm text-text-secondary">Completed</div>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <div className="text-2xl font-bold text-text">
              {avgProgress}%
            </div>
            <div className="text-sm text-text-secondary">Avg Progress</div>
          </div>
        </div>
      )}

      {/* Motivational Banner (when no goals yet) */}
      {!isLoading && goals.length === 0 && (
        <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl p-8 mb-8 text-center border border-primary/20">
          <span className="text-5xl mb-4 block">🚀</span>
          <h2 className="text-xl font-bold text-text mb-2">
            Ready to achieve something great?
          </h2>
          <p className="text-text-secondary mb-4 max-w-md mx-auto">
            Goals give your projects and tasks direction. Start by setting a meaningful goal
            you want to accomplish.
          </p>
          <button
            onClick={handleCreateGoal}
            className="inline-flex items-center justify-center px-6 py-3 font-medium rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Your First Goal
          </button>
        </div>
      )}

      {/* Goal List */}
      <GoalList
        goals={goals}
        projects={projects}
        onGoalClick={handleGoalClick}
        isLoading={isLoading}
        emptyMessage="No goals yet. Create one to get started!"
      />

      {/* Floating Add Button */}
      <FloatingAddButton onClick={handleCreateGoal} label="New Goal" />

      {/* Goal Modal */}
      <GoalModal
        goal={selectedGoal}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveGoal}
        onDelete={handleDeleteGoal}
        mode={modalMode}
      />
    </div>
  );
}
