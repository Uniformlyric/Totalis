import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import type { Task } from '@totalis/shared';

interface QuickAddTaskProps {
  onAdd: (task: Partial<Task>) => Promise<void>;
  defaultProjectId?: string;
}

export function QuickAddTask({ onAdd, defaultProjectId }: QuickAddTaskProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await onAdd({
        title: title.trim(),
        priority,
        status: 'pending',
        estimatedMinutes: 30,
        estimatedSource: 'manual',
        projectId: defaultProjectId,
        blockedBy: [],
        blocking: [],
        reminders: [],
        tags: [],
      });
      setTitle('');
      setPriority('medium');
      setIsExpanded(false);
    } catch (error) {
      console.error('Failed to add task:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full p-3 flex items-center gap-3 text-left rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-surface/50 hover:bg-surface transition-all group"
      >
        <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
        <span className="text-text-muted group-hover:text-text transition-colors">
          Add a new task...
        </span>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 rounded-xl border border-primary/30 bg-surface shadow-lg space-y-3"
    >
      <Input
        placeholder="What needs to be done?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsExpanded(false);
            setTitle('');
          }
        }}
      />

      <div className="flex items-center justify-between">
        {/* Priority quick select */}
        <div className="flex items-center gap-1">
          {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={`
                px-2 py-1 text-xs rounded-md transition-all capitalize
                ${priority === p
                  ? p === 'urgent'
                    ? 'bg-danger text-white'
                    : p === 'high'
                      ? 'bg-warning text-white'
                      : p === 'medium'
                        ? 'bg-primary text-white'
                        : 'bg-text-muted text-white'
                  : 'bg-background text-text-muted hover:text-text'
                }
              `}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsExpanded(false);
              setTitle('');
            }}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" isLoading={isSubmitting} disabled={!title.trim()}>
            Add Task
          </Button>
        </div>
      </div>
    </form>
  );
}
