import { useEffect, useState } from 'react';

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  color: string;
  rotation: number;
  scale: number;
}

interface CompletionCelebrationProps {
  isActive: boolean;
  onComplete?: () => void;
}

const colors = ['#6366f1', '#a855f7', '#ec4899', '#f97316', '#eab308', '#22c55e'];

export function CompletionCelebration({ isActive, onComplete }: CompletionCelebrationProps) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const [showCheckmark, setShowCheckmark] = useState(false);

  useEffect(() => {
    if (isActive) {
      // Create confetti pieces
      const newPieces: ConfettiPiece[] = [];
      for (let i = 0; i < 50; i++) {
        newPieces.push({
          id: i,
          x: 50 + (Math.random() - 0.5) * 20,
          y: 50,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * 360,
          scale: 0.5 + Math.random() * 0.5,
        });
      }
      setPieces(newPieces);
      setShowCheckmark(true);

      // Clear after animation
      const timer = setTimeout(() => {
        setPieces([]);
        setShowCheckmark(false);
        onComplete?.();
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [isActive, onComplete]);

  if (!isActive && pieces.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {/* Confetti */}
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute w-3 h-3 animate-confetti"
          style={{
            left: `${piece.x}%`,
            top: `${piece.y}%`,
            backgroundColor: piece.color,
            transform: `rotate(${piece.rotation}deg) scale(${piece.scale})`,
            borderRadius: Math.random() > 0.5 ? '50%' : '0',
            animationDelay: `${Math.random() * 0.3}s`,
            animationDuration: `${1 + Math.random() * 0.5}s`,
          }}
        />
      ))}

      {/* Center checkmark */}
      {showCheckmark && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-success/20 flex items-center justify-center animate-scale-up">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-success animate-draw-check"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

// Add to global.css:
// @keyframes confetti {
//   0% { transform: translateY(0) rotate(0deg); opacity: 1; }
//   100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
// }
// @keyframes scale-up {
//   0% { transform: scale(0); opacity: 0; }
//   50% { transform: scale(1.2); opacity: 1; }
//   100% { transform: scale(1); opacity: 1; }
// }
// @keyframes draw-check {
//   0% { stroke-dasharray: 0 100; }
//   100% { stroke-dasharray: 100 100; }
// }
