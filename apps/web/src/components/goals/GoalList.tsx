import { useState, useMemo } from 'react';
import { GoalCard } from './GoalCard';
import { Input } from '@/components/ui';
import type { Goal, Project } from '@totalis/shared';

interface GoalListProps {
  goals: Goal[];
  projects?: Project[];
  onGoalClick?: (goal: Goal) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

type FilterStatus = 'all' | 'active' | 'completed' | 'blocked' | 'archived';
type FilterTimeframe = 'all' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
type SortBy = 'updatedAt' | 'title' | 'deadline' | 'progress';

const statusFilters: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'archived', label: 'Archived' },
];

const timeframeFilters: { value: FilterTimeframe; label: string }[] = [
  { value: 'all', label: 'All Timeframes' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const sortOptions: { value: SortBy; label: string }[] = [
  { value: 'updatedAt', label: 'Recently Updated' },
  { value: 'title', label: 'Title' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'progress', label: 'Progress' },
];

export function GoalList({
  goals,
  projects = [],
  onGoalClick,
  isLoading = false,
  emptyMessage = 'No goals yet',
}: GoalListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [timeframeFilter, setTimeframeFilter] = useState<FilterTimeframe>('all');
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');

  const filteredAndSortedGoals = useMemo(() => {
    let result = [...goals];

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((g) => g.status === statusFilter);
    }

    // Filter by timeframe
    if (timeframeFilter !== 'all') {
      result = result.filter((g) => g.timeframe === timeframeFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(query) ||
          g.description?.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'deadline':
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case 'progress':
          return b.progress - a.progress;
        case 'updatedAt':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return result;
  }, [goals, searchQuery, statusFilter, timeframeFilter, sortBy]);

  const statusCounts = useMemo(() => {
    return {
      all: goals.length,
      active: goals.filter((g) => g.status === 'active').length,
      completed: goals.filter((g) => g.status === 'completed').length,
      blocked: goals.filter((g) => g.status === 'blocked').length,
      archived: goals.filter((g) => g.status === 'archived').length,
    };
  }, [goals]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Loading skeleton for filters */}
        <div className="animate-pulse flex flex-wrap gap-4">
          <div className="h-10 bg-surface-hover rounded-lg w-64"></div>
          <div className="h-10 bg-surface-hover rounded-lg w-32"></div>
          <div className="h-10 bg-surface-hover rounded-lg w-40"></div>
        </div>
        {/* Loading skeleton for cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-surface rounded-xl p-5 h-56">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-surface-hover"></div>
                <div className="flex-1">
                  <div className="h-5 bg-surface-hover rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-surface-hover rounded w-1/2"></div>
                </div>
              </div>
              <div className="h-2.5 bg-surface-hover rounded-full w-full mb-4"></div>
              <div className="h-4 bg-surface-hover rounded w-20"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <div className="flex flex-wrap gap-4 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Input
            type="search"
            placeholder="Search goals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Status Filter */}
        <div className="flex bg-surface rounded-lg p-1">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`
                px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                ${
                  statusFilter === filter.value
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:text-text hover:bg-surface-hover'
                }
              `}
            >
              {filter.label}
              {statusCounts[filter.value] > 0 && (
                <span
                  className={`
                    ml-1.5 px-1.5 py-0.5 text-xs rounded-full
                    ${
                      statusFilter === filter.value
                        ? 'bg-white/20'
                        : 'bg-surface-hover'
                    }
                  `}
                >
                  {statusCounts[filter.value]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Timeframe Filter */}
        <select
          value={timeframeFilter}
          onChange={(e) => setTimeframeFilter(e.target.value as FilterTimeframe)}
          className="px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {timeframeFilters.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              Sort by: {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Goals Grid */}
      {filteredAndSortedGoals.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface flex items-center justify-center">
            <span className="text-3xl">🎯</span>
          </div>
          <h3 className="text-lg font-medium text-text mb-1">
            {searchQuery || statusFilter !== 'all' || timeframeFilter !== 'all'
              ? 'No goals match your filters'
              : emptyMessage}
          </h3>
          <p className="text-sm text-text-secondary">
            {searchQuery || statusFilter !== 'all' || timeframeFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Set your first goal to start tracking progress'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              projects={projects}
              onClick={() => onGoalClick?.(goal)}
            />
          ))}
        </div>
      )}

      {/* Results count */}
      {filteredAndSortedGoals.length > 0 && (
        <p className="text-sm text-text-secondary text-center">
          Showing {filteredAndSortedGoals.length} of {goals.length} goals
        </p>
      )}
    </div>
  );
}
