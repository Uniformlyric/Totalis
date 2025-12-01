import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Badge, Card } from '@/components/ui';
import type { 
  ParsedItem, 
  ParsedTask, 
  ParsedHabit, 
  ParsedProject, 
  ParsedGoal,
  ChatMessage,
  ChatContext,
  ParseResult,
  ExistingTask,
  ExistingHabit,
  ExistingProject,
  ExistingGoal,
} from '@/lib/ai/gemini';
import { chatWithGemini } from '@/lib/ai/gemini';
import type { Project, Goal, Task, Habit } from '@totalis/shared';

// Helper to safely convert date to string
function toDateString(value: unknown): string | undefined {
  if (!value) return undefined;
  try {
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      return (value as { toDate: () => Date }).toDate().toISOString().split('T')[0];
    }
    const date = new Date(value as string | number);
    if (isNaN(date.getTime())) return undefined;
    return date.toISOString().split('T')[0];
  } catch {
    return undefined;
  }
}

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemsCreated: (items: ParsedItem[]) => void;
  existingTasks: Task[];
  existingHabits: Habit[];
  existingProjects: Project[];
  existingGoals: Goal[];
  apiKey: string;
}

// Item type icons
const ItemIcon = ({ type }: { type: ParsedItem['type'] }) => {
  switch (type) {
    case 'task':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case 'habit':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20v-6M6 20V10M18 20V4" />
        </svg>
      );
    case 'project':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3h18v18H3zM3 9h18M9 21V9"/>
        </svg>
      );
    case 'goal':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
  }
};

// Priority badge colors
const priorityColors = {
  urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

// Format date for display
function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch {
    return dateStr;
  }
}

// Parsed item card component
function ParsedItemCard({ 
  item, 
  onRemove,
  onEdit 
}: { 
  item: ParsedItem; 
  onRemove: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="bg-surface-hover rounded-lg p-3 border border-border group hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`p-1.5 rounded ${
          item.type === 'task' ? 'bg-blue-500/20 text-blue-400' :
          item.type === 'habit' ? 'bg-green-500/20 text-green-400' :
          item.type === 'project' ? 'bg-purple-500/20 text-purple-400' :
          'bg-amber-500/20 text-amber-400'
        }`}>
          <ItemIcon type={item.type} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-text truncate">{item.title}</span>
            <Badge variant="secondary" className="text-xs capitalize">
              {item.type}
            </Badge>
            {item.type === 'task' && (item as ParsedTask).priority && (
              <span className={`text-xs px-1.5 py-0.5 rounded border ${priorityColors[(item as ParsedTask).priority]}`}>
                {(item as ParsedTask).priority}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3 mt-1 text-xs text-text-muted flex-wrap">
            {item.type === 'task' && (item as ParsedTask).dueDate && (
              <span className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                {formatDate((item as ParsedTask).dueDate)}
              </span>
            )}
            {item.type === 'task' && (item as ParsedTask).projectName && (
              <span className="flex items-center gap-1">
                📁 {(item as ParsedTask).projectName}
              </span>
            )}
            {item.type === 'task' && (item as ParsedTask).estimatedMinutes && (
              <span className="flex items-center gap-1">
                ⏱️ {(item as ParsedTask).estimatedMinutes}min
              </span>
            )}
            {item.type === 'habit' && (
              <span className="flex items-center gap-1">
                🔄 {(item as ParsedHabit).frequency}
              </span>
            )}
            {item.type === 'project' && (item as ParsedProject).deadline && (
              <span className="flex items-center gap-1">
                📅 Due: {formatDate((item as ParsedProject).deadline)}
              </span>
            )}
            {item.type === 'goal' && (
              <span className="flex items-center gap-1">
                📊 {(item as ParsedGoal).timeframe}
              </span>
            )}
          </div>
          
          {item.description && (
            <p className="text-xs text-text-muted mt-1 line-clamp-1">{item.description}</p>
          )}
        </div>
        
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={onEdit}
            className="p-1 hover:bg-surface rounded text-text-muted hover:text-text"
            title="Edit"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button 
            onClick={onRemove}
            className="p-1 hover:bg-surface rounded text-text-muted hover:text-danger"
            title="Remove"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Chat message bubble
function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${
        isUser 
          ? 'bg-primary text-white rounded-br-md' 
          : 'bg-surface-hover text-text rounded-bl-md'
      }`}>
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <span className={`text-xs mt-1 block ${isUser ? 'text-white/60' : 'text-text-muted'}`}>
          {message.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

export function QuickCaptureModal({
  isOpen,
  onClose,
  onItemsCreated,
  existingTasks,
  existingHabits,
  existingProjects,
  existingGoals,
  apiKey,
}: QuickCaptureModalProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingItems, setPendingItems] = useState<ParsedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Convert existing data to the format expected by the AI
  const formattedTasks: ExistingTask[] = existingTasks.map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: toDateString(t.dueDate),
    projectId: t.projectId,
  }));

  const formattedHabits: ExistingHabit[] = existingHabits.map(h => ({
    id: h.id,
    title: h.title,
    frequency: h.frequency,
    currentStreak: h.currentStreak,
  }));

  const formattedProjects: ExistingProject[] = existingProjects.map(p => ({
    id: p.id,
    title: p.title,
    status: p.status,
    color: p.color,
    deadline: toDateString(p.deadline),
  }));

  const formattedGoals: ExistingGoal[] = existingGoals.map(g => ({
    id: g.id,
    title: g.title,
    status: g.status,
    deadline: toDateString(g.deadline),
    progress: g.progress,
  }));

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Keep items but reset for next session
      setInput('');
      setError(null);
    }
  }, [isOpen]);

  // Handle send message
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const context: ChatContext = {
        messages: [...messages, userMessage],
        pendingItems,
        existingTasks: formattedTasks,
        existingHabits: formattedHabits,
        existingProjects: formattedProjects,
        existingGoals: formattedGoals,
      };

      const result = await chatWithGemini(input.trim(), context, apiKey);

      // Add AI response to messages
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: result.message,
        timestamp: new Date(),
        parsedItems: result.items,
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Add new items to pending
      if (result.items.length > 0) {
        setPendingItems(prev => [...prev, ...result.items]);
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError('Failed to process your message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle keyboard submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Remove item from pending
  const handleRemoveItem = (index: number) => {
    setPendingItems(prev => prev.filter((_, i) => i !== index));
  };

  // Edit item (for now, just add a message suggesting the edit)
  const handleEditItem = (index: number) => {
    const item = pendingItems[index];
    setInput(`Change the ${item.type} "${item.title}" to `);
    inputRef.current?.focus();
  };

  // Create all pending items
  const handleCreateAll = () => {
    if (pendingItems.length === 0) return;
    onItemsCreated(pendingItems);
    setPendingItems([]);
    setMessages([]);
    onClose();
  };

  // Clear all
  const handleClearAll = () => {
    setPendingItems([]);
    setMessages([{
      role: 'assistant',
      content: "I've cleared everything. What would you like to add?",
      timestamp: new Date(),
    }]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div 
        ref={modalRef}
        className="w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-hover/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-text">Quick Capture</h2>
              <p className="text-xs text-text-muted">Add tasks, habits, projects, goals naturally</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-surface rounded-lg text-text-muted hover:text-text transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Chat Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px]">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h3 className="text-lg font-medium text-text mb-2">What's on your mind?</h3>
              <p className="text-text-muted text-sm max-w-md mx-auto mb-4">
                Just type naturally. I'll help you create tasks, habits, projects, and goals.
              </p>
              <div className="flex flex-wrap justify-center gap-2 text-xs">
                <span className="px-2 py-1 bg-surface-hover rounded-full text-text-muted">
                  "Finish the report by Friday"
                </span>
                <span className="px-2 py-1 bg-surface-hover rounded-full text-text-muted">
                  "Start meditating daily"
                </span>
                <span className="px-2 py-1 bg-surface-hover rounded-full text-text-muted">
                  "URGENT: call the client"
                </span>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <ChatBubble key={i} message={msg} />
            ))
          )}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-surface-hover rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">
              {error}
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Pending Items */}
        {pendingItems.length > 0 && (
          <div className="border-t border-border p-4 bg-surface-hover/30">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-text">Ready to add</h3>
                <Badge variant="primary">{pendingItems.length}</Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleClearAll}>
                  Clear all
                </Button>
                <Button variant="primary" size="sm" onClick={handleCreateAll}>
                  Add all →
                </Button>
              </div>
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {pendingItems.map((item, i) => (
                <ParsedItemCard
                  key={i}
                  item={item}
                  onRemove={() => handleRemoveItem(i)}
                  onEdit={() => handleEditItem(i)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="border-t border-border p-4 bg-surface">
          <div className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type what you want to add... (Shift+Enter for new line)"
              className="flex-1 bg-surface-hover border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              rows={2}
              disabled={isLoading}
            />
            <Button
              variant="primary"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="self-end"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
            <span>
              <kbd className="px-1.5 py-0.5 bg-surface-hover rounded">Enter</kbd> to send · 
              <kbd className="px-1.5 py-0.5 bg-surface-hover rounded ml-1">Shift+Enter</kbd> for new line
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-surface-hover rounded">Esc</kbd> to close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
