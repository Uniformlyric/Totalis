import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Badge } from '@/components/ui';
import { FloatingAddButton } from '@/components/tasks';
import { NoteCard } from './NoteCard';
import { NoteModal } from './NoteModal';
import type { Note, Task, Project, Goal } from '@totalis/shared';
import type { User } from 'firebase/auth';

export function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { getAuthInstance } = await import('@/lib/firebase');
        const { onAuthStateChanged } = await import('firebase/auth');
        const auth = getAuthInstance();
        
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
          setUser(firebaseUser);
          setAuthChecked(true);
          
          if (!firebaseUser) {
            window.location.href = '/login';
          }
        });

        return () => unsubscribe();
      } catch (err) {
        console.error('Auth check failed:', err);
        setAuthChecked(true);
      }
    };

    checkAuth();
  }, []);

  // Load data
  useEffect(() => {
    if (!authChecked || !user) return;

    const unsubscribes: (() => void)[] = [];

    const loadData = async () => {
      try {
        const { subscribeToNotes } = await import('@/lib/db/notes');
        const { subscribeToTasks } = await import('@/lib/db/tasks');
        const { subscribeToProjects } = await import('@/lib/db/projects');
        const { subscribeToGoals } = await import('@/lib/db/goals');

        const unsubNotes = subscribeToNotes(user.uid, (updatedNotes) => {
          setNotes(updatedNotes);
          setIsLoading(false);
        });
        unsubscribes.push(unsubNotes);

        const unsubTasks = subscribeToTasks((updatedTasks) => {
          setTasks(updatedTasks);
        });
        unsubscribes.push(unsubTasks);

        const unsubProjects = subscribeToProjects(user.uid, (updatedProjects) => {
          setProjects(updatedProjects);
        });
        unsubscribes.push(unsubProjects);

        const unsubGoals = subscribeToGoals(user.uid, (updatedGoals) => {
          setGoals(updatedGoals);
        });
        unsubscribes.push(unsubGoals);
      } catch (err) {
        console.error('Failed to load data:', err);
        setIsLoading(false);
      }
    };

    loadData();

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [authChecked, user]);

  // Save note
  const handleSaveNote = async (noteData: Omit<Note, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    const { createNote, updateNote } = await import('@/lib/db/notes');
    
    if (editingNote) {
      await updateNote(editingNote.id, noteData);
    } else {
      await createNote(noteData);
    }
    
    setEditingNote(null);
  };

  // Toggle pin
  const handleTogglePin = async (note: Note) => {
    const { updateNote } = await import('@/lib/db/notes');
    await updateNote(note.id, { isPinned: !note.isPinned });
  };

  // Delete note
  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    
    const { deleteNote } = await import('@/lib/db/notes');
    await deleteNote(noteId);
  };

  // Filter notes
  const filteredNotes = notes.filter((note) => {
    if (showPinnedOnly && !note.isPinned) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        note.tags.some((t) => t.toLowerCase().includes(query))
      );
    }
    return true;
  });

  // Separate pinned and unpinned
  const pinnedNotes = filteredNotes.filter((n) => n.isPinned);
  const unpinnedNotes = filteredNotes.filter((n) => !n.isPinned);

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-text-muted">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Notes</h1>
          <p className="text-text-secondary mt-1">
            Quick notes and ideas linked to your work
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingNote(null);
            setIsModalOpen(true);
          }}
          leftIcon={
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          }
        >
          New Note
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            }
          />
        </div>
        <Button
          variant={showPinnedOnly ? 'primary' : 'secondary'}
          onClick={() => setShowPinnedOnly(!showPinnedOnly)}
          leftIcon={
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={showPinnedOnly ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22"/>
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
            </svg>
          }
        >
          Pinned
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-pulse bg-surface rounded-lg border border-border p-4">
              <div className="h-5 bg-border rounded w-3/4 mb-3" />
              <div className="space-y-2">
                <div className="h-3 bg-border rounded w-full" />
                <div className="h-3 bg-border rounded w-2/3" />
              </div>
              <div className="flex gap-2 mt-4">
                <div className="h-5 w-16 bg-border rounded" />
                <div className="h-5 w-12 bg-border rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredNotes.length === 0 ? (
        <Card variant="bordered" className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-hover flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text mb-2">
            {searchQuery || showPinnedOnly ? 'No notes found' : 'No notes yet'}
          </h3>
          <p className="text-text-muted mb-4">
            {searchQuery || showPinnedOnly
              ? 'Try adjusting your filters'
              : 'Create your first note to capture ideas and thoughts'}
          </p>
          {!searchQuery && !showPinnedOnly && (
            <Button
              onClick={() => {
                setEditingNote(null);
                setIsModalOpen(true);
              }}
            >
              Create Note
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Pinned Notes */}
          {pinnedNotes.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-text-muted mb-3 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-warning">
                  <line x1="12" y1="17" x2="12" y2="22"/>
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
                </svg>
                Pinned ({pinnedNotes.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pinnedNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onClick={() => {
                      setEditingNote(note);
                      setIsModalOpen(true);
                    }}
                    onPin={() => handleTogglePin(note)}
                    onDelete={() => handleDeleteNote(note.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other Notes */}
          {unpinnedNotes.length > 0 && (
            <div>
              {pinnedNotes.length > 0 && (
                <h2 className="text-sm font-medium text-text-muted mb-3">
                  Other Notes ({unpinnedNotes.length})
                </h2>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {unpinnedNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onClick={() => {
                      setEditingNote(note);
                      setIsModalOpen(true);
                    }}
                    onPin={() => handleTogglePin(note)}
                    onDelete={() => handleDeleteNote(note.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      <NoteModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingNote(null);
        }}
        note={editingNote}
        onSave={handleSaveNote}
        tasks={tasks}
        projects={projects}
        goals={goals}
      />

      {/* Floating Add Button (mobile) */}
      <FloatingAddButton
        onClick={() => {
          setEditingNote(null);
          setIsModalOpen(true);
        }}
        label="New Note"
      />
    </div>
  );
}
