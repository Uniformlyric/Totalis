import { useState, useEffect } from 'react';
import { Modal, Button, Input, Textarea, Badge } from '@/components/ui';
import { MilestoneList } from './MilestoneList';
import type { Project, Goal, Task } from '@totalis/shared';

interface ProjectModalProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (project: Partial<Project>) => Promise<void>;
  onDelete?: (projectId: string) => Promise<void>;
  onTaskClick?: (task: Task) => void;
  goals?: Goal[];
  mode?: 'create' | 'edit';
}

const statusOptions: { value: Project['status']; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'archived', label: 'Archived' },
];

const colorOptions = [
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
];

export function ProjectModal({
  project,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onTaskClick,
  goals = [],
  mode = 'edit',
}: ProjectModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'milestones'>('details');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Project['status']>('active');
  const [color, setColor] = useState(colorOptions[0]);
  const [goalId, setGoalId] = useState<string>('');
  const [deadline, setDeadline] = useState('');
  const [estimatedHours, setEstimatedHours] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Helper to safely convert Firestore Timestamp or date to string
  const toDateString = (value: unknown): string => {
    if (!value) return '';
    try {
      // Handle Firestore Timestamp
      if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
        return (value as { toDate: () => Date }).toDate().toISOString().split('T')[0];
      }
      // Handle date string or Date object
      const date = new Date(value as string | number);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  // Reset form when project changes
  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setDescription(project.description || '');
      setStatus(project.status);
      setColor(project.color || colorOptions[0]);
      setGoalId(project.goalId || '');
      setDeadline(toDateString(project.deadline));
      setEstimatedHours(project.estimatedHours || 0);
      setTags(project.tags || []);
      // Auto-switch to milestones tab if project has them
      if (project.milestoneCount && project.milestoneCount > 0) {
        setActiveTab('milestones');
      } else {
        setActiveTab('details');
      }
    } else {
      // Reset for new project
      setTitle('');
      setDescription('');
      setStatus('active');
      setColor(colorOptions[0]);
      setGoalId('');
      setDeadline('');
      setEstimatedHours(0);
      setTags([]);
      setActiveTab('details');
    }
    setShowDeleteConfirm(false);
  }, [project, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        ...(project?.id ? { id: project.id } : {}),
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        color,
        goalId: goalId || undefined,
        deadline: deadline ? new Date(deadline) : undefined,
        estimatedHours,
        tags,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!project?.id || !onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(project.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete project:', error);
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
      title={mode === 'create' ? 'Create Project' : project?.title || 'Edit Project'}
      size="lg"
    >
      {/* Tabs (only show in edit mode with existing project) */}
      {mode === 'edit' && project && (
        <div className="flex border-b border-border mb-4">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'details'
                ? 'text-primary border-b-2 border-primary'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('milestones')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'milestones'
                ? 'text-primary border-b-2 border-primary'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            Milestones {project.milestoneCount ? `(${project.milestoneCount})` : ''}
          </button>
        </div>
      )}

      {/* Details Tab */}
      {activeTab === 'details' && (
        <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <Input
          label="Project Name"
          placeholder="My awesome project"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />

        {/* Description */}
        <Textarea
          label="Description"
          placeholder="What is this project about?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        {/* Color picker */}
        <div>
          <label className="block text-sm font-medium text-text mb-2">Color</label>
          <div className="flex gap-2 flex-wrap">
            {colorOptions.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`
                  w-8 h-8 rounded-lg transition-all
                  ${color === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-primary scale-110' : 'hover:scale-105'}
                `}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Status and Goal */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Project['status'])}
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
            <label className="block text-sm font-medium text-text mb-2">Linked Goal</label>
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">No goal</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Deadline and Estimated Hours */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">Deadline</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Estimated Hours
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
            />
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
        {showDeleteConfirm && onDelete && project?.id && (
          <div className="p-4 bg-danger/10 border border-danger/20 rounded-lg">
            <div className="flex items-start gap-3 mb-3">
              <svg className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-semibold text-danger mb-2">
                  Are you sure you want to delete this project?
                </p>
                <p className="text-sm text-text-secondary mb-2">
                  This will permanently delete:
                </p>
                <ul className="text-sm text-text-secondary space-y-1 ml-4 list-disc">
                  <li>The project: <span className="font-medium text-text">{project.title}</span></li>
                  {project.milestoneCount > 0 && (
                    <li><span className="font-medium text-text">{project.milestoneCount}</span> milestone{project.milestoneCount !== 1 ? 's' : ''}</li>
                  )}
                  {project.taskCount > 0 && (
                    <li><span className="font-medium text-text">{project.taskCount}</span> task{project.taskCount !== 1 ? 's' : ''}</li>
                  )}
                </ul>
                <p className="text-sm text-danger font-medium mt-3">
                  ⚠️ This action cannot be undone!
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleDelete}
                isLoading={isDeleting}
              >
                Yes, Delete Everything
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
            {mode === 'edit' && onDelete && project?.id && !showDeleteConfirm && (
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
              {mode === 'create' ? 'Create Project' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
      )}

      {/* Milestones Tab */}
      {activeTab === 'milestones' && project && (
        <div className="space-y-4">
          <div className="mb-4 p-4 bg-surface-hover rounded-lg border border-border">
            <h3 className="text-lg font-semibold text-text mb-2">
              {project.title}
            </h3>
            {project.description && (
              <p className="text-sm text-text-secondary mb-3">{project.description}</p>
            )}
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-text-secondary">Progress:</span>{' '}
                <span className="font-medium text-text">{project.progress}%</span>
              </div>
              <div>
                <span className="text-text-secondary">Milestones:</span>{' '}
                <span className="font-medium text-text">
                  {project.completedMilestoneCount || 0} / {project.milestoneCount}
                </span>
              </div>
              <div>
                <span className="text-text-secondary">Tasks:</span>{' '}
                <span className="font-medium text-text">
                  {project.completedTaskCount || 0} / {project.taskCount || 0}
                </span>
              </div>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto pr-2">
            <MilestoneList projectId={project.id} onTaskClick={onTaskClick} />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between pt-4 border-t border-border">
            <Button 
              variant="secondary" 
              onClick={() => setActiveTab('details')}
            >
              ← View Details
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
