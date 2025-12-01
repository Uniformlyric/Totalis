import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui';

interface ShortcutGroup {
  title: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Quick Actions',
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: 'Open AI Quick Capture' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close modal / Cancel' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['G', 'H'], description: 'Go to Dashboard (Home)' },
      { keys: ['G', 'T'], description: 'Go to Tasks' },
      { keys: ['G', 'P'], description: 'Go to Projects' },
      { keys: ['G', 'G'], description: 'Go to Goals' },
      { keys: ['G', 'A'], description: 'Go to Habits' },
      { keys: ['G', 'C'], description: 'Go to Calendar' },
      { keys: ['G', 'N'], description: 'Go to Notes' },
      { keys: ['G', 'F'], description: 'Go to Focus Mode' },
      { keys: ['G', 'S'], description: 'Go to Settings' },
    ],
  },
];

function KeyboardKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-2 py-1 text-xs font-mono bg-surface-hover border border-border rounded shadow-sm text-text">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Show shortcuts modal on ?
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title="Keyboard Shortcuts"
      size="md"
    >
      <div className="space-y-6">
        {SHORTCUTS.map((group) => (
          <div key={group.title}>
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
              {group.title}
            </h3>
            <div className="space-y-2">
              {group.shortcuts.map((shortcut, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <span className="text-text-secondary">{shortcut.description}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, keyIdx) => (
                      <span key={keyIdx} className="flex items-center gap-1">
                        <KeyboardKey>{key}</KeyboardKey>
                        {keyIdx < shortcut.keys.length - 1 && (
                          <span className="text-text-muted">+</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="pt-4 border-t border-border">
          <p className="text-xs text-text-muted text-center">
            Press <KeyboardKey>?</KeyboardKey> anywhere to show this help
          </p>
        </div>
      </div>
    </Modal>
  );
}

// Navigation shortcut handler hook
export function useNavigationShortcuts() {
  useEffect(() => {
    let gPressed = false;
    let gTimeout: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // G + letter navigation
      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
        gPressed = true;
        // Reset after 1 second
        gTimeout = setTimeout(() => {
          gPressed = false;
        }, 1000);
        return;
      }

      if (gPressed) {
        gPressed = false;
        if (gTimeout) clearTimeout(gTimeout);

        const routes: Record<string, string> = {
          h: '/',
          t: '/tasks',
          p: '/projects',
          g: '/goals',
          a: '/habits',
          c: '/calendar',
          n: '/notes',
          f: '/focus',
          s: '/settings',
        };

        const route = routes[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          window.location.href = route;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (gTimeout) clearTimeout(gTimeout);
    };
  }, []);
}
