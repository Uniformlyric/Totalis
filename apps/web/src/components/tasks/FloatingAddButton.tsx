import { useState } from 'react';
import { Button } from '@/components/ui';
import { TaskModal } from './TaskModal';
import type { Task } from '@totalis/shared';

interface FloatingAddButtonProps {
  onAdd: (task: Partial<Task>) => Promise<void>;
}

export function FloatingAddButton({ onAdd }: FloatingAddButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="
          fixed bottom-6 right-6 z-40
          w-14 h-14 rounded-full
          bg-gradient-to-r from-primary to-secondary
          text-white shadow-lg shadow-primary/25
          flex items-center justify-center
          hover:scale-110 active:scale-95
          transition-transform
          md:hidden
        "
        aria-label="Add new task"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Desktop Add Button (in header area) */}
      <Button
        onClick={() => setIsModalOpen(true)}
        className="hidden md:flex"
        leftIcon={
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        }
      >
        New Task
      </Button>

      {/* Task Creation Modal */}
      <TaskModal
        task={null}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={onAdd}
        mode="create"
      />
    </>
  );
}
