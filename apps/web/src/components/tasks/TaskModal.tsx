import { useState, useEffect, useRef } from 'react';
import { Modal, Button, Input, Textarea, Badge } from '@/components/ui';
import type { Task, Project, Milestone } from '@totalis/shared';

interface TaskModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Partial<Task>) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
  onComplete?: (taskId: string) => Promise<void>;
  projects?: Project[];
  milestones?: Milestone[];
  mode?: 'create' | 'edit';
}

const priorityOptions: { value: Task['priority']; label: string; color: string; description: string; shortcut: string }[] = [
  { value: 'low', label: 'Low', color: 'bg-gray-500', description: 'Nice to have', shortcut: '1' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-500', description: 'Should do', shortcut: '2' },
  { value: 'high', label: 'High', color: 'bg-orange-500', description: 'Important', shortcut: '3' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500', description: 'Do now!', shortcut: '4' },
];

const statusOptions: { value: Task['status']; label: string; icon: string }[] = [
  { value: 'pending', label: 'To Do', icon: '○' },
  { value: 'in_progress', label: 'In Progress', icon: '◐' },
  { value: 'completed', label: 'Completed', icon: '●' },
  { value: 'blocked', label: 'Blocked', icon: '⊘' },
];

const timePresets = [
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
  { label: '4h', value: 240 },
];

const datePresets = [
  { label: 'Today', getValue: () => new Date() },
  { label: 'Tomorrow', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d; } },
  { label: 'Next Week', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 7); return d; } },
  { label: 'Next Month', getValue: () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; } },
];

export function TaskModal({
  task,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onComplete,
  projects = [],
  milestones = [],
  mode = 'edit',
}: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [status, setStatus] = useState<Task['status']>('pending');
  const [projectId, setProjectId] = useState<string>('');
  const [milestoneId, setMilestoneId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [createAnother, setCreateAnother] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Get milestones for selected project
  const projectMilestones = milestones.filter(m => m.projectId === projectId);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Enter to save
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (title.trim()) {
          document.getElementById('task-form')?.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true })
          );
        }
      }
      // Alt + 1-4 for priority
      if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const priorities: Task['priority'][] = ['low', 'medium', 'high', 'urgent'];
        setPriority(priorities[parseInt(e.key) - 1]);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, title]);

  // Helper to safely convert date to string
  const toDateString = (value: unknown): string => {
    if (!value) return '';
    try {
      // Handle Firestore Timestamp
      if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as any).toDate === 'function') {
        return (value as any).toDate().toISOString().split('T')[0];
      }
      // Handle date string or Date object
      const date = new Date(value as string | number);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  // Reset for create another
  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setStatus('pending');
    setEstimatedMinutes(30);
    setTags([]);
    setTagInput('');
    setShowDeleteConfirm(false);
    // Keep project/milestone/dueDate for rapid entry
    setTimeout(() => titleInputRef.current?.focus(), 100);
  };

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setPriority(task.priority || 'medium');
      setStatus(task.status || 'pending');
      setProjectId(task.projectId || '');
      setMilestoneId(task.milestoneId || '');
      setDueDate(toDateString(task.dueDate));
      setEstimatedMinutes(task.estimatedMinutes || 30);
      setTags(Array.isArray(task.tags) ? task.tags : []);
    } else {
      // Reset for new task
      setTitle('');
      setDescription('');
      setPriority('medium');
      setStatus('pending');
      setProjectId('');
      setMilestoneId('');
      setDueDate('');
      setEstimatedMinutes(30);
      setTags([]);
    }
    setShowDeleteConfirm(false);
    setShowAdvanced(false);
    setCreateAnother(false);
  }, [task, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        ...(task?.id ? { id: task.id } : {}),
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        status,
        projectId: projectId || undefined,
        milestoneId: milestoneId || undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        estimatedMinutes,
        estimatedSource: 'manual',
        tags,
      });
      
      // Handle create another
      if (mode === 'create' && createAnother) {
        resetForm();
      } else {
        onClose();
      }
    } catch (error) {
      console.error('Failed to save task:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task?.id || !onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(task.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete task:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? 'Quick Add Task' : task?.title || 'Edit Task'}
      size="lg"
    >
      <form id="task-form" onSubmit={handleSubmit} className="space-y-5">
        {/* Keyboard hints for power users */}
        {mode === 'create' && (
          <div className="flex items-center gap-4 text-xs text-text-muted bg-surface-hover/50 rounded-lg px-3 py-2">
            <span>⌨️ Shortcuts:</span>
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">⌘+Enter</kbd> Save</span>
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Alt+1-4</kbd> Priority</span>
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Esc</kbd> Close</span>
          </div>
        )}

        {/* Title - Prominent */}
        <div>
          <Input
            ref={titleInputRef}
            label="What needs to be done?"
            placeholder="e.g., Review quarterly report, Call dentist, Research competitors..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            className="text-lg"
          />
        </div>

        {/* Quick Row: Priority + Time + Due Date */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Priority - Compact */}
          <div>
            <label className="block text-sm font-medium text-text mb-2">Priority</label>
            <div className="grid grid-cols-4 gap-1">
              {priorityOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPriority(option.value)}
                  title={`${option.description} (Alt+${option.shortcut})`}
                  className={`
                    p-2 rounded-lg border transition-all text-center
                    ${priority === option.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-surface hover:border-primary/30'
                    }
                  `}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${option.color} mx-auto mb-0.5`} />
                  <span className={`text-xs font-medium ${priority === option.value ? 'text-primary' : 'text-text-muted'}`}>
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Time Estimate - Quick buttons */}
          <div>
            <label className="block text-sm font-medium text-text mb-2">Duration</label>
            <div className="flex gap-1">
              {timePresets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setEstimatedMinutes(preset.value)}
                  className={`
                    flex-1 py-2 px-1 text-xs rounded-lg border transition-all
                    ${estimatedMinutes === preset.value
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border bg-surface text-text-muted hover:border-primary/30'
                    }
                  `}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date - Quick buttons */}
          <div>
            <label className="block text-sm font-medium text-text mb-2">Due</label>
            <div className="flex gap-1">
              {datePresets.slice(0, 3).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setDueDate(preset.getValue().toISOString().split('T')[0])}
                  className={`
                    flex-1 py-2 px-1 text-xs rounded-lg border transition-all
                    ${dueDate === preset.getValue().toISOString().split('T')[0]
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border bg-surface text-text-muted hover:border-primary/30'
                    }
                  `}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Description - Collapsible in create mode */}
        {(mode === 'edit' || description || showAdvanced) && (
          <div>
            <Textarea
              label="Details (optional)"
              placeholder="Add any additional context, notes, or requirements..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        )}

        {/* Advanced Options Toggle */}
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
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            More options (project, tags, custom date...)
          </button>
        )}

        {/* Advanced/Edit Options */}
        {(mode === 'edit' || showAdvanced) && (
          <>
            {/* Status - Only show in edit mode */}
            {mode === 'edit' && (
              <div>
                <label className="block text-sm font-medium text-text mb-3">Status</label>
                <div className="grid grid-cols-4 gap-2">
                  {statusOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setStatus(option.value)}
                      className={`
                        p-2 rounded-lg border-2 transition-all text-center
                        ${status === option.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-surface hover:border-primary/30'
                        }
                      `}
                    >
                      <span className="text-lg block mb-0.5">{option.icon}</span>
                      <span className={`text-xs font-medium ${status === option.value ? 'text-primary' : 'text-text'}`}>
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Project & Milestone Selection */}
            {projects.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Project</label>
                  <select
                    value={projectId}
                    onChange={(e) => {
                      setProjectId(e.target.value);
                      setMilestoneId(''); // Reset milestone when project changes
                    }}
                    className="w-full px-3 py-2.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">No project</option>
                    {projects.filter(p => p.status === 'active').map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Milestone Selection - only if project has milestones */}
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Milestone</label>
                  <select
                    value={milestoneId}
                    onChange={(e) => setMilestoneId(e.target.value)}
                    disabled={!projectId || projectMilestones.length === 0}
                    className="w-full px-3 py-2.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  >
                    <option value="">{projectMilestones.length === 0 ? 'No milestones' : 'Select milestone'}</option>
                    {projectMilestones.map((milestone) => (
                      <option key={milestone.id} value={milestone.id}>
                        #{milestone.order} - {milestone.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Custom Due Date and Time Slider */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text mb-2">Custom Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Custom Duration
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="5"
                    max="480"
                    step="5"
                    value={estimatedMinutes}
                    onChange={(e) => setEstimatedMinutes(parseInt(e.target.value))}
                    className="flex-1 accent-primary h-2"
                  />
                  <span className="text-sm font-medium text-text w-20 text-right bg-surface-hover px-2 py-1 rounded">
                    {estimatedMinutes < 60
                      ? `${estimatedMinutes}m`
                      : `${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60 > 0 ? `${estimatedMinutes % 60}m` : ''}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="pl-2 pr-1 py-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1 p-0.5 hover:bg-background rounded"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  className="flex-1"
                />
                <Button type="button" variant="secondary" onClick={addTag} size="sm">
                  Add
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Delete Confirmation */}
        {showDeleteConfirm && onDelete && task?.id && (
          <div className="p-4 bg-danger/10 border border-danger/20 rounded-lg">
            <p className="text-sm text-danger mb-3">
              Are you sure you want to delete this task? This action cannot be undone.
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
          <div className="flex items-center gap-4">
            {mode === 'edit' && onDelete && task?.id && !showDeleteConfirm && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-danger hover:bg-danger/10"
                size="sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Delete
              </Button>
            )}
            {mode === 'create' && (
              <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={createAnother}
                  onChange={(e) => setCreateAnother(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                Create another
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSaving}>
              {mode === 'create' ? (createAnother ? 'Create & Next' : 'Create Task') : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
