import { useState, useEffect } from 'react';
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

const priorityOptions: { value: Task['priority']; label: string; color: string; description: string }[] = [
  { value: 'low', label: 'Low', color: 'bg-gray-500', description: 'Nice to have' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-500', description: 'Should do' },
  { value: 'high', label: 'High', color: 'bg-orange-500', description: 'Important' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500', description: 'Do now!' },
];

const statusOptions: { value: Task['status']; label: string; icon: string }[] = [
  { value: 'pending', label: 'To Do', icon: '○' },
  { value: 'in_progress', label: 'In Progress', icon: '◐' },
  { value: 'completed', label: 'Completed', icon: '●' },
  { value: 'blocked', label: 'Blocked', icon: '⊘' },
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

  // Get milestones for selected project
  const projectMilestones = milestones.filter(m => m.projectId === projectId);

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
      onClose();
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
      title={mode === 'create' ? 'Create Task' : task?.title || 'Edit Task'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title - Prominent */}
        <div>
          <Input
            label="What needs to be done?"
            placeholder="e.g., Review quarterly report, Call dentist, Research competitors..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            className="text-lg"
          />
        </div>

        {/* Description */}
        <div>
          <Textarea
            label="Details (optional)"
            placeholder="Add any additional context, notes, or requirements..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        {/* Priority - Visual Selection */}
        <div>
          <label className="block text-sm font-medium text-text mb-3">Priority Level</label>
          <div className="grid grid-cols-4 gap-2">
            {priorityOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPriority(option.value)}
                className={`
                  p-3 rounded-lg border-2 transition-all text-center
                  ${priority === option.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-surface hover:border-primary/30'
                  }
                `}
              >
                <div className={`w-3 h-3 rounded-full ${option.color} mx-auto mb-1`} />
                <span className={`text-sm font-medium ${priority === option.value ? 'text-primary' : 'text-text'}`}>
                  {option.label}
                </span>
                <span className="text-xs text-text-muted block mt-0.5">{option.description}</span>
              </button>
            ))}
          </div>
        </div>

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

        {/* Due Date and Estimated Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              How long will this take?
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
            <div className="flex justify-between text-xs text-text-muted mt-1">
              <span>Quick task</span>
              <span>Half day</span>
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
            <Button type="button" variant="secondary" onClick={addTag}>
              Add
            </Button>
          </div>
        </div>

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
          <div>
            {mode === 'edit' && onDelete && task?.id && !showDeleteConfirm && (
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
              {mode === 'create' ? 'Create Task' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
