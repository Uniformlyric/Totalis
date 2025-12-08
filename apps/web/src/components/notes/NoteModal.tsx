import { useState, useEffect, useRef } from 'react';
import { Modal, Button, Input, Badge } from '@/components/ui';
import type { Note, Task, Project, Goal } from '@totalis/shared';

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  note?: Note | null;
  onSave: (note: Omit<Note, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  tasks?: Task[];
  projects?: Project[];
  goals?: Goal[];
}

export function NoteModal({ isOpen, onClose, note, onSave, tasks, projects, goals }: NoteModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [taskId, setTaskId] = useState<string | undefined>(undefined);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [goalId, setGoalId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Enter to save
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, title, content]);

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setIsPinned(note.isPinned);
      setTags(note.tags);
      setTaskId(note.taskId);
      setProjectId(note.projectId);
      setGoalId(note.goalId);
      setShowAdvanced(true);
    } else {
      setTitle('');
      setContent('');
      setIsPinned(false);
      setTags([]);
      setTagInput('');
      setTaskId(undefined);
      setProjectId(undefined);
      setGoalId(undefined);
      setShowAdvanced(false);
    }
  }, [note, isOpen]);

  // Auto-focus content area
  useEffect(() => {
    if (isOpen && contentRef.current) {
      setTimeout(() => contentRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim().toLowerCase();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSave({
        title: title.trim() || 'Untitled Note',
        content,
        isPinned,
        tags,
        taskId,
        projectId,
        goalId,
      });
      onClose();
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={note ? 'Edit Note' : 'Quick Note'} size="lg">
      <div className="space-y-4">
        {/* Keyboard hints */}
        {!note && (
          <div className="flex items-center gap-4 text-xs text-text-muted bg-surface-hover/50 rounded-lg px-3 py-2">
            <span>⌨️ Shortcuts:</span>
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">⌘+Enter</kbd> Save</span>
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Esc</kbd> Close</span>
          </div>
        )}

        {/* Title */}
        <div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title (optional)"
            className="text-lg font-medium"
          />
        </div>

        {/* Content */}
        <div>
          <textarea
            ref={contentRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Start typing your note... (supports markdown)"
            rows={8}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none font-mono text-sm"
          />
        </div>

        {/* Pin toggle - always visible */}
        <div className="flex items-center justify-between py-2 px-3 bg-surface-hover rounded-lg">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isPinned ? 'text-warning' : 'text-text-muted'}>
              <line x1="12" y1="17" x2="12" y2="22"/>
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
            </svg>
            <span className="text-sm font-medium text-text">Pin this note</span>
          </div>
          <button
            type="button"
            onClick={() => setIsPinned(!isPinned)}
            className={`w-10 h-5 rounded-full relative transition-colors ${
              isPinned ? 'bg-warning' : 'bg-surface'
            }`}
          >
            <span 
              className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                isPinned ? 'right-0.5 bg-white' : 'left-0.5 bg-text-muted'
              }`}
            />
          </button>
        </div>

        {/* Advanced options toggle */}
        {!note && !showAdvanced && (
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
            More options (link to task/project, tags...)
          </button>
        )}

        {/* Advanced options */}
        {(showAdvanced || note) && (
          <>
            {/* Link to Task/Project/Goal */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {tasks && tasks.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Link to Task</label>
                  <select
                    value={taskId || ''}
                    onChange={(e) => setTaskId(e.target.value || undefined)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  >
                    <option value="">None</option>
                    {tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {projects && projects.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Link to Project</label>
                  <select
                    value={projectId || ''}
                    onChange={(e) => setProjectId(e.target.value || undefined)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  >
                    <option value="">None</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {goals && goals.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Link to Goal</label>
                  <select
                    value={goalId || ''}
                    onChange={(e) => setGoalId(e.target.value || undefined)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  >
                    <option value="">None</option>
                    {goals.map((goal) => (
                      <option key={goal.id} value={goal.id}>
                        {goal.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-danger"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Add a tag"
                  className="flex-1"
                />
                <Button type="button" variant="secondary" onClick={handleAddTag}>
                  Add
                </Button>
              </div>
            </div>

            {/* Pin Toggle */}
            <div className="flex items-center justify-between py-2 px-3 bg-surface-hover rounded-lg">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isPinned ? 'text-warning' : 'text-text-muted'}>
                  <line x1="12" y1="17" x2="12" y2="22"/>
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
                </svg>
                <span className="text-sm font-medium text-text">Pin this note</span>
              </div>
              <button
                type="button"
                onClick={() => setIsPinned(!isPinned)}
                className={`w-10 h-5 rounded-full relative transition-colors ${
                  isPinned ? 'bg-warning' : 'bg-surface'
                }`}
              >
                <span 
                  className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                    isPinned ? 'right-0.5 bg-white' : 'left-0.5 bg-text-muted'
                  }`}
                />
              </button>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            {note ? 'Save Changes' : 'Create Note'}
            <span className="ml-2 text-xs opacity-60">⌘↵</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
