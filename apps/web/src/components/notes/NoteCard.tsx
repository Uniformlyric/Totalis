import { Badge } from '@/components/ui';
import type { Note } from '@totalis/shared';

interface NoteCardProps {
  note: Note;
  onClick?: () => void;
  onPin?: () => void;
  onDelete?: () => void;
}

export function NoteCard({ note, onClick, onPin, onDelete }: NoteCardProps) {
  const formattedDate = new Date(note.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  // Strip HTML for preview
  const contentPreview = note.content
    .replace(/<[^>]*>/g, '')
    .substring(0, 150);

  return (
    <div
      className="group bg-surface rounded-lg border border-border p-4 hover:border-primary/50 transition-all cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-text truncate flex-1">
          {note.title || 'Untitled Note'}
        </h3>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPin?.();
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              note.isPinned
                ? 'text-warning bg-warning/10'
                : 'text-text-muted hover:text-text hover:bg-surface-hover'
            }`}
            title={note.isPinned ? 'Unpin' : 'Pin'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={note.isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22"/>
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            title="Delete"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18"/>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      
      {contentPreview && (
        <p className="text-sm text-text-secondary mt-2 line-clamp-3">
          {contentPreview}
          {note.content.length > 150 && '...'}
        </p>
      )}
      
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {note.isPinned && (
          <Badge variant="warning" className="text-xs">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" className="mr-1">
              <line x1="12" y1="17" x2="12" y2="22"/>
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
            </svg>
            Pinned
          </Badge>
        )}
        {note.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs">
            {tag}
          </Badge>
        ))}
        {note.tags.length > 3 && (
          <span className="text-xs text-text-muted">+{note.tags.length - 3}</span>
        )}
        <span className="text-xs text-text-muted ml-auto">{formattedDate}</span>
      </div>
    </div>
  );
}
