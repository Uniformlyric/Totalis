import { useState, useEffect } from 'react';
import { Modal, Button, Input, Textarea } from '@/components/ui';
import type { Habit } from '@totalis/shared';

interface HabitModalProps {
  habit: Habit | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (habit: Partial<Habit>) => Promise<void>;
  onDelete?: (habitId: string) => Promise<void>;
  mode?: 'create' | 'edit';
}

const frequencyOptions: { value: Habit['frequency']; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Custom Days' },
];

const colorOptions = [
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#f97316', // Orange
  '#eab308', // Yellow
  '#14b8a6', // Teal
  '#ef4444', // Red
];

const iconOptions = ['🏃', '💪', '📚', '🧘', '💧', '🍎', '😴', '✍️', '🎸', '💊', '🧹', '📱'];

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function HabitModal({
  habit,
  isOpen,
  onClose,
  onSave,
  onDelete,
  mode = 'edit',
}: HabitModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<Habit['frequency']>('daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [reminderTime, setReminderTime] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(30);
  const [color, setColor] = useState(colorOptions[0]);
  const [icon, setIcon] = useState(iconOptions[0]);
  const [targetPerDay, setTargetPerDay] = useState<number | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset form when habit changes
  useEffect(() => {
    if (habit) {
      setTitle(habit.title);
      setDescription(habit.description || '');
      setFrequency(habit.frequency);
      setDaysOfWeek(habit.daysOfWeek || [0, 1, 2, 3, 4, 5, 6]);
      setReminderTime(habit.reminderTime || '');
      setScheduledTime(habit.scheduledTime || '');
      setEstimatedMinutes(habit.estimatedMinutes || 30);
      setColor(habit.color || colorOptions[0]);
      setIcon(habit.icon || iconOptions[0]);
      setTargetPerDay(habit.targetPerDay);
    } else {
      // Reset for new habit
      setTitle('');
      setDescription('');
      setFrequency('daily');
      setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
      setReminderTime('');
      setScheduledTime('');
      setEstimatedMinutes(30);
      setColor(colorOptions[0]);
      setIcon(iconOptions[0]);
      setTargetPerDay(undefined);
    }
    setShowDeleteConfirm(false);
  }, [habit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        ...(habit?.id ? { id: habit.id } : {}),
        title: title.trim(),
        description: description.trim() || undefined,
        frequency,
        daysOfWeek: frequency === 'custom' ? daysOfWeek : undefined,
        reminderTime: reminderTime || undefined,
        scheduledTime: scheduledTime || undefined,
        estimatedMinutes: estimatedMinutes || 30,
        color,
        icon,
        targetPerDay: targetPerDay || undefined,
        tags: [],
      });
      onClose();
    } catch (error) {
      console.error('Failed to save habit:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!habit?.id || !onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(habit.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete habit:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleDay = (day: number) => {
    if (daysOfWeek.includes(day)) {
      setDaysOfWeek(daysOfWeek.filter((d) => d !== day));
    } else {
      setDaysOfWeek([...daysOfWeek, day].sort());
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? 'Create Habit' : 'Edit Habit'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Icon and Title */}
        <div className="flex gap-3">
          <div>
            <label className="block text-sm font-medium text-text mb-2">Icon</label>
            <div className="grid grid-cols-6 gap-1 p-2 bg-surface-hover rounded-lg">
              {iconOptions.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={`
                    w-8 h-8 text-xl rounded-md flex items-center justify-center
                    transition-all
                    ${icon === i
                      ? 'bg-primary/20 ring-2 ring-primary'
                      : 'hover:bg-surface'
                    }
                  `}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <Input
              label="Habit Name"
              placeholder="e.g., Exercise, Read, Meditate"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
        </div>

        {/* Description */}
        <Textarea
          label="Description (optional)"
          placeholder="What's your motivation for this habit?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />

        {/* Color Picker */}
        <div>
          <label className="block text-sm font-medium text-text mb-2">Color</label>
          <div className="flex gap-2">
            {colorOptions.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`
                  w-8 h-8 rounded-full transition-all
                  ${color === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-primary scale-110' : 'hover:scale-105'}
                `}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Frequency */}
        <div>
          <label className="block text-sm font-medium text-text mb-2">Frequency</label>
          <div className="flex gap-2">
            {frequencyOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFrequency(option.value)}
                className={`
                  flex-1 py-2 px-4 text-sm rounded-lg border transition-all
                  ${frequency === option.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-text-muted hover:border-primary/30'
                  }
                `}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Days of Week (for custom) */}
        {frequency === 'custom' && (
          <div>
            <label className="block text-sm font-medium text-text mb-2">Select Days</label>
            <div className="flex gap-2">
              {dayNames.map((day, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => toggleDay(index)}
                  className={`
                    flex-1 py-2 text-sm rounded-lg border transition-all
                    ${daysOfWeek.includes(index)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-surface text-text-muted hover:border-primary/30'
                    }
                  `}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reminder Time */}
        <div>
          <label className="block text-sm font-medium text-text mb-2">
            Reminder Time (optional)
          </label>
          <input
            type="time"
            value={reminderTime}
            onChange={(e) => setReminderTime(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Scheduled Time & Duration - for calendar blocking */}
        <div className="p-4 bg-surface-hover/50 rounded-lg space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">📅</span>
            <span className="text-sm font-medium text-text">Calendar Blocking</span>
            <span className="text-xs text-text-muted">(shows on daily schedule)</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Scheduled Time
              </label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="When to do this habit"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Duration (minutes)
              </label>
              <input
                type="number"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(parseInt(e.target.value) || 30)}
                min={5}
                max={240}
                step={5}
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          
          {scheduledTime && (
            <p className="text-xs text-text-muted">
              ✓ This habit will appear as a {estimatedMinutes}-minute block at {scheduledTime} on the calendar
            </p>
          )}
        </div>

        {/* Target per Day */}
        <div>
          <label className="block text-sm font-medium text-text mb-2">
            Target per Day (optional)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              value={targetPerDay ?? ''}
              onChange={(e) => setTargetPerDay(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="e.g., 3 glasses of water"
              className="flex-1 px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-sm text-text-muted">times</span>
          </div>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && onDelete && habit?.id && (
          <div className="p-4 bg-danger/10 border border-danger/20 rounded-lg">
            <p className="text-sm text-danger mb-3">
              Are you sure you want to delete this habit? Your streak and history will be lost.
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
            {mode === 'edit' && onDelete && habit?.id && !showDeleteConfirm && (
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
              {mode === 'create' ? 'Create Habit' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
