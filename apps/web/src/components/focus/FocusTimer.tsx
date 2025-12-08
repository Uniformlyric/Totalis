import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import type { Task, FocusSession } from '@totalis/shared';

interface FocusTimerProps {
  task?: Task | null;
  onSessionStart?: (session: FocusSession) => void;
  onSessionEnd?: (session: FocusSession) => void;
}

type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

const TIMER_DURATIONS = {
  focus: 25 * 60, // 25 minutes
  shortBreak: 5 * 60, // 5 minutes
  longBreak: 15 * 60, // 15 minutes
};

export function FocusTimer({ task, onSessionStart, onSessionEnd }: FocusTimerProps) {
  const [mode, setMode] = useState<TimerMode>('focus');
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATIONS.focus);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [autoCycle, setAutoCycle] = useState(true); // Auto-cycle between focus and breaks
  const [pendingAutoStart, setPendingAutoStart] = useState(false); // Flag for auto-starting next session
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage
  const progress = ((TIMER_DURATIONS[mode] - timeLeft) / TIMER_DURATIONS[mode]) * 100;

  // Get color based on mode
  const getModeColor = () => {
    switch (mode) {
      case 'focus': return 'var(--primary)';
      case 'shortBreak': return 'var(--success)';
      case 'longBreak': return 'var(--accent)';
    }
  };

  // Timer logic
  useEffect(() => {
    if (isRunning && !isPaused) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            // Timer completed
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, isPaused]);

  // Handle timer completion
  const handleTimerComplete = useCallback(async () => {
    setIsRunning(false);
    setIsPaused(false);
    
    // Play notification sound
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }

    // Send browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Totalis Focus', {
        body: mode === 'focus' 
          ? 'Focus session complete! Time for a break.' 
          : 'Break time over! Ready to focus?',
        icon: '/favicon.svg',
      });
    }

    let nextMode: TimerMode;
    
    if (mode === 'focus' && sessionId) {
      // Complete the focus session
      try {
        const { updateFocusSession } = await import('@/lib/db/focusSessions');
        await updateFocusSession(sessionId, {
          status: 'completed',
          actualDuration: TIMER_DURATIONS.focus / 60,
          endedAt: new Date(),
        });
        
        setSessionsCompleted((prev) => prev + 1);
        
        // Determine next break type
        nextMode = (sessionsCompleted + 1) % 4 === 0 ? 'longBreak' : 'shortBreak';
      } catch (err) {
        console.error('Failed to update session:', err);
        nextMode = 'shortBreak';
      }
    } else {
      // Break is complete, switch to focus
      nextMode = 'focus';
    }
    
    setMode(nextMode);
    setTimeLeft(TIMER_DURATIONS[nextMode]);
    setSessionId(null);
    setStartTime(null);
    
    // Auto-cycle: automatically start the next session after a brief delay
    if (autoCycle) {
      setPendingAutoStart(true);
    }
  }, [mode, sessionId, sessionsCompleted, autoCycle]);
  
  // Handle auto-start after mode change
  useEffect(() => {
    if (pendingAutoStart && !isRunning) {
      // Small delay to let user see the transition
      const timer = setTimeout(() => {
        setPendingAutoStart(false);
        handleStart();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [pendingAutoStart, isRunning]);

  // Start timer
  const handleStart = async () => {
    if (mode === 'focus') {
      // Create a new focus session
      try {
        const { createFocusSession } = await import('@/lib/db/focusSessions');
        const id = await createFocusSession({
          taskId: task?.id,
          type: 'pomodoro',
          plannedDuration: TIMER_DURATIONS.focus / 60,
          actualDuration: 0,
          status: 'in_progress',
          startedAt: new Date(),
        });
        setSessionId(id);
        setStartTime(new Date());
      } catch (err) {
        console.error('Failed to create session:', err);
      }
    }
    
    setIsRunning(true);
    setIsPaused(false);
  };

  // Pause timer
  const handlePause = () => {
    setIsPaused(true);
  };

  // Resume timer
  const handleResume = () => {
    setIsPaused(false);
  };

  // Stop timer completely (also stops auto-cycle)
  const handleStop = async () => {
    // Cancel any pending auto-start
    setPendingAutoStart(false);
    
    if (sessionId && mode === 'focus') {
      // Mark session as interrupted
      try {
        const { updateFocusSession } = await import('@/lib/db/focusSessions');
        const elapsedMinutes = startTime 
          ? Math.floor((Date.now() - startTime.getTime()) / 60000)
          : 0;
        
        await updateFocusSession(sessionId, {
          status: 'interrupted',
          actualDuration: elapsedMinutes,
          endedAt: new Date(),
        });
      } catch (err) {
        console.error('Failed to update session:', err);
      }
    }
    
    setIsRunning(false);
    setIsPaused(false);
    setTimeLeft(TIMER_DURATIONS[mode]);
    setSessionId(null);
    setStartTime(null);
  };
  
  // End entire focus session (stop auto-cycling)
  const handleEndSession = async () => {
    setPendingAutoStart(false);
    setAutoCycle(false);
    await handleStop();
    // Reset to focus mode
    setMode('focus');
    setTimeLeft(TIMER_DURATIONS.focus);
  };

  // Change mode
  const handleModeChange = (newMode: TimerMode) => {
    if (isRunning) return;
    setMode(newMode);
    setTimeLeft(TIMER_DURATIONS[newMode]);
  };

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return (
    <Card variant="bordered" className="text-center">
      {/* Auto-cycle toggle */}
      <div className="flex items-center justify-center gap-3 mb-4 pb-4 border-b border-border">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoCycle}
            onChange={(e) => setAutoCycle(e.target.checked)}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm text-text">Auto-cycle</span>
        </label>
        <span className="text-xs text-text-muted">
          {autoCycle 
            ? '🔄 Will auto-start next session' 
            : '⏸️ Manual control'
          }
        </span>
        {pendingAutoStart && (
          <Badge variant="primary" size="sm" className="animate-pulse">
            Starting in 1s...
          </Badge>
        )}
      </div>
      
      {/* Mode selector */}
      <div className="flex justify-center gap-2 mb-6">
        {(['focus', 'shortBreak', 'longBreak'] as TimerMode[]).map((m) => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            disabled={isRunning}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === m
                ? m === 'focus'
                  ? 'bg-primary text-white'
                  : m === 'shortBreak'
                  ? 'bg-success text-white'
                  : 'bg-accent text-white'
                : 'text-text-secondary hover:bg-surface-hover disabled:opacity-50'
            }`}
          >
            {m === 'focus' ? 'Focus' : m === 'shortBreak' ? 'Short Break' : 'Long Break'}
          </button>
        ))}
      </div>

      {/* Task info */}
      {task && (
        <div className="mb-4 p-3 bg-surface-hover rounded-lg inline-flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span className="text-text font-medium">{task.title}</span>
        </div>
      )}

      {/* Timer display */}
      <div className="relative w-64 h-64 mx-auto mb-6">
        {/* Background circle */}
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="128"
            cy="128"
            r="120"
            fill="none"
            stroke="var(--border)"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <circle
            cx="128"
            cy="128"
            r="120"
            fill="none"
            stroke={getModeColor()}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 120}
            strokeDashoffset={2 * Math.PI * 120 * (1 - progress / 100)}
            className="transition-all duration-1000"
          />
        </svg>
        
        {/* Time display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-bold text-text font-mono">
            {formatTime(timeLeft)}
          </span>
          <span className="text-text-muted text-sm mt-2">
            {mode === 'focus' ? 'Focus Time' : mode === 'shortBreak' ? 'Short Break' : 'Long Break'}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-3 mb-4">
        <div className="flex justify-center gap-3">
          {!isRunning && !pendingAutoStart ? (
            <Button size="lg" onClick={handleStart}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="mr-2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Start
            </Button>
          ) : isPaused ? (
            <>
              <Button size="lg" onClick={handleResume}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="mr-2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Resume
              </Button>
              <Button size="lg" variant="danger" onClick={handleStop}>
                Skip
              </Button>
            </>
          ) : pendingAutoStart ? (
            <>
              <Button size="lg" variant="secondary" onClick={() => setPendingAutoStart(false)}>
                Skip Next
              </Button>
              <Button size="lg" variant="danger" onClick={handleEndSession}>
                End Session
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" variant="secondary" onClick={handlePause}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="mr-2">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                Pause
              </Button>
              <Button size="lg" variant="secondary" onClick={handleStop}>
                Skip
              </Button>
            </>
          )}
        </div>
        
        {/* End Session button - always visible when timer is active or auto-cycling */}
        {(isRunning || pendingAutoStart || sessionsCompleted > 0) && !pendingAutoStart && (
          <Button size="sm" variant="danger" onClick={handleEndSession}>
            🛑 End Focus Session
          </Button>
        )}
      </div>

      {/* Sessions completed */}
      <div className="flex justify-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full transition-colors ${
              i < sessionsCompleted % 4 ? 'bg-primary' : 'bg-border'
            }`}
          />
        ))}
        <span className="text-sm text-text-muted ml-2">
          {sessionsCompleted} session{sessionsCompleted !== 1 ? 's' : ''} today
        </span>
      </div>

      {/* Hidden audio element for notification sound */}
      <audio ref={audioRef} preload="auto">
        <source src="/sounds/notification.mp3" type="audio/mpeg" />
      </audio>
    </Card>
  );
}
