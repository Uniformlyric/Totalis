import { useState, useEffect, useRef } from 'react';
import { Modal, Button, Input, Textarea, Badge } from '@/components/ui';
import type { Goal } from '@totalis/shared';

interface GoalModalProps {
  goal: Goal | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (goal: Partial<Goal>) => Promise<void>;
  onDelete?: (goalId: string) => Promise<void>;
  mode?: 'create' | 'edit';
}

const statusOptions: { value: Goal['status']; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'archived', label: 'Archived' },
];

const timeframeOptions: { value: Goal['timeframe']; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
];

const iconOptions = ['🎯', '🏆', '💪', '📚', '💰', '🏃', '🧘', '🎨', '💼', '🌟', '🚀', '❤️'];

export function GoalModal({
  goal,
  isOpen,
  onClose,
  onSave,
  onDelete,
  mode = 'edit',
}: GoalModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Goal['status']>('active');
  const [icon, setIcon] = useState(iconOptions[0]);
  const [timeframe, setTimeframe] = useState<Goal['timeframe']>('monthly');
  const [deadline, setDeadline] = useState('');
  const [targetValue, setTargetValue] = useState<number | undefined>(undefined);
  const [currentValue, setCurrentValue] = useState<number | undefined>(undefined);
  const [unit, setUnit] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Reset form when goal changes
  useEffect(() => {
    if (goal) {
      setTitle(goal.title);
      setDescription(goal.description || '');
      setStatus(goal.status);
      setIcon(goal.icon || iconOptions[0]);
      setTimeframe(goal.timeframe);
      setDeadline(goal.deadline ? new Date(goal.deadline).toISOString().split('T')[0] : '');
      setTargetValue(goal.targetValue);
      setCurrentValue(goal.currentValue);
      setUnit(goal.unit || '');
    } else {
      // Reset for new goal
      setTitle('');
      setDescription('');
      setStatus('active');
      setIcon(iconOptions[0]);
      setTimeframe('monthly');
      setDeadline('');
      setTargetValue(undefined);
      setCurrentValue(undefined);
      setUnit('');
    }
    setShowDeleteConfirm(false);
  }, [goal, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      // Calculate progress if target value is set
      let progress = 0;
      if (targetValue && currentValue !== undefined) {
        progress = Math.min(100, Math.round((currentValue / targetValue) * 100));
      }

      await onSave({
        ...(goal?.id ? { id: goal.id } : {}),
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        icon,
        timeframe,
        deadline: deadline ? new Date(deadline) : undefined,
        targetValue: targetValue || undefined,
        currentValue: currentValue || undefined,
        unit: unit.trim() || undefined,
        progress,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save goal:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!goal?.id || !onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(goal.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete goal:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? 'Create Goal' : 'Edit Goal'}
      size="lg"
    >
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        {/* Icon and Title */}
        <div className="flex gap-3">
          <div>
            <label className="block text-sm font-medium text-text mb-2">Icon</label>
            <div className="relative">
              <select
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-16 h-10 text-2xl bg-surface border border-border rounded-lg text-center appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {iconOptions.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex-1">
            <Input
              label="Goal Title"
              placeholder="What do you want to achieve?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
        </div>

        {/* Description */}
        <Textarea
          label="Description"
          placeholder="Why is this goal important to you?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        {/* Status and Timeframe */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Goal['status'])}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Goal['timeframe'])}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {timeframeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Advanced options toggle (create mode only) */}
        {mode === 'create' && !showAdvanced && (
          <button
            type="button"
            onClick={() => setShowAdvanced(true)}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
            </svg>
            More options (deadline, measurable target...)
          </button>
        )}

        {/* Advanced fields - always shown in edit mode */}
        {(showAdvanced || mode === 'edit') && (
          <>
            {/* Deadline */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">Target Date</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Measurable Target */}
            <div className="p-4 bg-surface-hover/50 rounded-lg">
          <label className="block text-sm font-medium text-text mb-3">
            Measurable Target (Optional)
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Current</label>
              <input
                type="number"
                min="0"
                step="any"
                value={currentValue ?? ''}
                onChange={(e) => setCurrentValue(e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="0"
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Target</label>
              <input
                type="number"
                min="0"
                step="any"
                value={targetValue ?? ''}
                onChange={(e) => setTargetValue(e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="100"
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Unit</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="hours, $, etc."
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          {targetValue !== undefined && currentValue !== undefined && targetValue > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-text-secondary">Progress</span>
                <span className="font-medium text-text">
                  {Math.min(100, Math.round((currentValue / targetValue) * 100))}%
                </span>
              </div>
              <div className="h-2 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all"
                  style={{ width: `${Math.min(100, (currentValue / targetValue) * 100)}%` }}
                />
              </div>
            </div>
          )}
            </div>
          </>
        )}

        {/* Delete Confirmation */}
        {showDeleteConfirm && onDelete && goal?.id && (
          <div className="p-4 bg-danger/10 border border-danger/20 rounded-lg">
            <p className="text-sm text-danger mb-3">
              Are you sure you want to delete this goal? Projects linked to this goal will be unlinked.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleDelete}
                isLoading={isDeleting}
              >
                Yes, Delete
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div>
            {mode === 'edit' && onDelete && goal?.id && !showDeleteConfirm && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-danger hover:bg-danger/10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSaving}>
              {mode === 'create' ? 'Create Goal' : 'Save Changes'}
              <span className="ml-2 text-xs opacity-60">⌘↵</span>
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
