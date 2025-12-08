import { useState, useEffect } from 'react';
import { Modal, Button, Badge } from '@/components/ui';
import type { Task, Project, Milestone, Habit } from '@totalis/shared';
import type { 
  LegacySchedulerConfig as SchedulerConfig, 
  LegacyScheduleAnalysis as ScheduleAnalysis, 
  LegacySchedulePreview as SchedulePreview,
  LegacyWorkingSchedule as WorkingSchedule,
  EnergyProfile 
} from '@/lib/scheduler/legacy-bridge';
import { 
  getDefaultSchedulerConfig, 
  analyzeSchedule, 
  generateSmartSchedule,
  applySchedulePreview,
  unscheduleAllTasks
} from '@/lib/scheduler/legacy-bridge';

interface SchedulerControlCenterProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  projects: Project[];
  milestones: Milestone[];
  habits: Habit[];
  workingSchedule: WorkingSchedule;
  energyProfile?: EnergyProfile;
  onScheduleApplied: () => void;
}

type Step = 'configure' | 'analyze' | 'preview' | 'applying';

export function SchedulerControlCenter({
  isOpen,
  onClose,
  tasks,
  projects,
  milestones,
  habits,
  workingSchedule,
  energyProfile,
  onScheduleApplied,
}: SchedulerControlCenterProps) {
  const [step, setStep] = useState<Step>('configure');
  const [config, setConfig] = useState<SchedulerConfig>(() => 
    getDefaultSchedulerConfig(workingSchedule)
  );
  const [analysis, setAnalysis] = useState<ScheduleAnalysis | null>(null);
  const [previews, setPreviews] = useState<SchedulePreview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickActionLoading, setQuickActionLoading] = useState<string | null>(null);
  const [showUnscheduleConfirm, setShowUnscheduleConfirm] = useState<'day' | 'week' | 'month' | 'all' | null>(null);
  
  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('configure');
      setConfig(getDefaultSchedulerConfig(workingSchedule));
      setAnalysis(null);
      setPreviews([]);
      setError(null);
      setQuickActionLoading(null);
      setShowUnscheduleConfirm(null);
    }
  }, [isOpen, workingSchedule]);
  
  // Quick Action: Schedule Due Tasks (prioritizes deadlines)
  const handleQuickScheduleDueTasks = async () => {
    setQuickActionLoading('due-tasks');
    setError(null);
    
    try {
      const dueTasks = tasks.filter(t => 
        t.dueDate && 
        !t.scheduledStart && 
        t.status !== 'completed'
      );
      
      if (dueTasks.length === 0) {
        setError('No unscheduled tasks with deadlines found.');
        setQuickActionLoading(null);
        return;
      }
      
      const quickConfig = {
        ...config,
        strictDeadlines: true,
        deadlineBufferDays: 2,
        intensityMode: 'deadline-driven' as const,
      };
      
      // Pass ALL tasks so scheduler knows which time slots are already blocked
      const result = await generateSmartSchedule(
        tasks,  // All tasks - scheduler will separate scheduled vs unscheduled
        { ...quickConfig, energyProfile },
        workingSchedule,
        milestones,
        habits
      );
      
      setPreviews(result);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule tasks');
    } finally {
      setQuickActionLoading(null);
    }
  };
  
  // Quick Action: Schedule This Week
  const handleQuickScheduleWeek = async () => {
    setQuickActionLoading('week');
    setError(null);
    
    try {
      const now = new Date();
      const endOfWeek = new Date();
      endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
      
      const weekConfig = {
        ...config,
        startDate: now,
        endDate: endOfWeek,
        intensityMode: 'balanced' as const,
      };
      
      const unscheduledTasks = tasks.filter(t => 
        !t.scheduledStart && t.status !== 'completed'
      );
      
      if (unscheduledTasks.length === 0) {
        setError('No unscheduled tasks to schedule.');
        setQuickActionLoading(null);
        return;
      }
      
      // Pass ALL tasks so scheduler knows which time slots are already blocked
      const result = await generateSmartSchedule(
        tasks,  // All tasks - scheduler will separate scheduled vs unscheduled
        { ...weekConfig, energyProfile },
        workingSchedule,
        milestones,
        habits
      );
      
      setPreviews(result);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule week');
    } finally {
      setQuickActionLoading(null);
    }
  };
  
  // Quick Action: Unschedule Tasks
  const handleUnschedule = async (scope: 'day' | 'week' | 'month' | 'all') => {
    setQuickActionLoading(`unschedule-${scope}`);
    setError(null);
    
    try {
      // Calculate date ranges based on scope
      const now = new Date();
      let startDate: Date;
      let endDate: Date;
      
      switch (scope) {
        case 'day':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
          break;
        case 'week':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 7);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
          break;
        case 'all':
        default:
          startDate = new Date(2000, 0, 1);
          endDate = new Date(2100, 11, 31);
          break;
      }
      
      const count = await unscheduleAllTasks(tasks, startDate, endDate);
      
      setShowUnscheduleConfirm(null);
      onScheduleApplied();
      onClose();
      
      // Show success message (would be better with a toast system)
      console.log(`Unscheduled ${count} tasks`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unschedule tasks');
    } finally {
      setQuickActionLoading(null);
    }
  };
  
  const handleAnalyze = () => {
    const result = analyzeSchedule(tasks, config, workingSchedule);
    setAnalysis(result);
    setStep('analyze');
  };
  
  const handleGenerateSchedule = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await generateSmartSchedule(
        tasks,
        { ...config, energyProfile },
        workingSchedule,
        milestones,
        habits
      );
      
      setPreviews(result);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleApplySchedule = async () => {
    setStep('applying');
    setIsLoading(true);
    
    try {
      for (const preview of previews) {
        await applySchedulePreview(preview);
      }
      onScheduleApplied();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply schedule');
      setStep('preview');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Date helpers
  const formatDate = (date: Date) => date.toISOString().split('T')[0];
  const parseDate = (str: string) => new Date(str + 'T00:00:00');
  
  // Calculate quick stats
  const unscheduledCount = tasks.filter(t => !t.scheduledStart && t.status !== 'completed').length;
  const deadlineCount = tasks.filter(t => t.dueDate && !t.scheduledStart && t.status !== 'completed').length;
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🧠 Smart Scheduler"
      size="lg"
    >
      <div className="space-y-6">
        {/* Progress Steps */}
        <div className="flex items-center gap-2 text-sm">
          <StepIndicator step={1} current={step} label="Configure" active={step === 'configure'} />
          <div className="flex-1 h-px bg-border" />
          <StepIndicator step={2} current={step} label="Analyze" active={step === 'analyze'} />
          <div className="flex-1 h-px bg-border" />
          <StepIndicator step={3} current={step} label="Review" active={step === 'preview'} />
          <div className="flex-1 h-px bg-border" />
          <StepIndicator step={4} current={step} label="Apply" active={step === 'applying'} />
        </div>
        
        {error && (
          <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm">
            {error}
          </div>
        )}
        
        {/* Step 1: Configure */}
        {step === 'configure' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-surface-hover rounded-lg text-center">
                <div className="text-2xl font-bold text-primary">{unscheduledCount}</div>
                <div className="text-xs text-text-secondary">Unscheduled Tasks</div>
              </div>
              <div className="p-4 bg-surface-hover rounded-lg text-center">
                <div className="text-2xl font-bold text-warning">{deadlineCount}</div>
                <div className="text-xs text-text-secondary">With Deadlines</div>
              </div>
              <div className="p-4 bg-surface-hover rounded-lg text-center">
                <div className="text-2xl font-bold text-success">{projects.length}</div>
                <div className="text-xs text-text-secondary">Active Projects</div>
              </div>
            </div>
            
            {/* Quick Actions */}
            <div className="space-y-3">
              <h3 className="font-semibold text-text">⚡ Quick Actions</h3>
              <p className="text-sm text-text-secondary">
                One-click actions for common scheduling needs, or configure below for more control.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleQuickScheduleDueTasks}
                  disabled={quickActionLoading !== null || deadlineCount === 0}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    deadlineCount === 0
                      ? 'border-border bg-surface-hover/50 opacity-50 cursor-not-allowed'
                      : 'border-warning/50 bg-warning/5 hover:border-warning hover:bg-warning/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">⏰</span>
                    <span className="font-medium text-text">
                      {quickActionLoading === 'due-tasks' ? 'Scheduling...' : 'Schedule Due Tasks'}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    {deadlineCount} tasks with deadlines prioritized
                  </p>
                </button>
                
                <button
                  onClick={handleQuickScheduleWeek}
                  disabled={quickActionLoading !== null || unscheduledCount === 0}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    unscheduledCount === 0
                      ? 'border-border bg-surface-hover/50 opacity-50 cursor-not-allowed'
                      : 'border-primary/50 bg-primary/5 hover:border-primary hover:bg-primary/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">📅</span>
                    <span className="font-medium text-text">
                      {quickActionLoading === 'week' ? 'Scheduling...' : 'Schedule This Week'}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    Fill this week with unscheduled tasks
                  </p>
                </button>
                
                <button
                  onClick={() => setShowUnscheduleConfirm('week')}
                  disabled={quickActionLoading !== null}
                  className="p-4 rounded-lg border-2 border-danger/30 bg-danger/5 hover:border-danger hover:bg-danger/10 text-left transition-all"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🔄</span>
                    <span className="font-medium text-text">Clear & Reschedule</span>
                  </div>
                  <p className="text-xs text-text-muted">
                    Unschedule tasks and start fresh
                  </p>
                </button>
                
                <button
                  onClick={() => setShowUnscheduleConfirm('all')}
                  disabled={quickActionLoading !== null}
                  className="p-4 rounded-lg border-2 border-border hover:border-danger hover:bg-danger/5 text-left transition-all"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🗑️</span>
                    <span className="font-medium text-text">Unschedule All</span>
                  </div>
                  <p className="text-xs text-text-muted">
                    Clear all scheduled times
                  </p>
                </button>
              </div>
              
              {/* Unschedule Confirmation */}
              {showUnscheduleConfirm && (
                <div className="p-4 bg-danger/10 border border-danger/20 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 text-danger">
                    <span>⚠️</span>
                    <span className="font-medium">
                      {showUnscheduleConfirm === 'all' 
                        ? 'Unschedule ALL tasks?' 
                        : `Unschedule tasks for this ${showUnscheduleConfirm}?`}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary">
                    This will remove scheduled times from tasks. They won't be deleted, just unscheduled.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowUnscheduleConfirm(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleUnschedule(showUnscheduleConfirm)}
                      isLoading={quickActionLoading?.startsWith('unschedule')}
                    >
                      Yes, Unschedule
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold text-text mb-2">🎛️ Or Configure Custom Schedule</h3>
              <p className="text-sm text-text-secondary mb-4">
                Fine-tune your schedule settings below for more control.
              </p>
            </div>
            
            {/* Date Range */}
            <div className="space-y-3">
              <h3 className="font-semibold text-text">📅 Schedule Range</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Start Date</label>
                  <input
                    type="date"
                    value={formatDate(config.startDate)}
                    onChange={(e) => setConfig({ ...config, startDate: parseDate(e.target.value) })}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">End Date</label>
                  <input
                    type="date"
                    value={formatDate(config.endDate)}
                    onChange={(e) => setConfig({ ...config, endDate: parseDate(e.target.value) })}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text"
                  />
                </div>
              </div>
              
              {/* Quick Range Buttons */}
              <div className="flex gap-2">
                <QuickRangeButton 
                  label="This Week" 
                  onClick={() => {
                    const start = new Date();
                    const end = new Date();
                    end.setDate(end.getDate() + (7 - end.getDay()));
                    setConfig({ ...config, startDate: start, endDate: end });
                  }}
                />
                <QuickRangeButton 
                  label="This Month" 
                  onClick={() => {
                    const start = new Date();
                    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
                    setConfig({ ...config, startDate: start, endDate: end });
                  }}
                />
                <QuickRangeButton 
                  label="Next 2 Weeks" 
                  onClick={() => {
                    const start = new Date();
                    const end = new Date();
                    end.setDate(end.getDate() + 14);
                    setConfig({ ...config, startDate: start, endDate: end });
                  }}
                />
                <QuickRangeButton 
                  label="Next 3 Months" 
                  onClick={() => {
                    const start = new Date();
                    const end = new Date();
                    end.setMonth(end.getMonth() + 3);
                    setConfig({ ...config, startDate: start, endDate: end });
                  }}
                />
              </div>
            </div>
            
            {/* Intensity Mode */}
            <div className="space-y-3">
              <h3 className="font-semibold text-text">⚡ Intensity Mode</h3>
              <div className="grid grid-cols-4 gap-2">
                {(['relaxed', 'balanced', 'intense', 'deadline-driven'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setConfig({ ...config, intensityMode: mode })}
                    className={`p-3 rounded-lg border-2 transition-all text-center ${
                      config.intensityMode === mode
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-text-muted text-text-secondary'
                    }`}
                  >
                    <div className="text-lg mb-1">
                      {mode === 'relaxed' && '🧘'}
                      {mode === 'balanced' && '⚖️'}
                      {mode === 'intense' && '🔥'}
                      {mode === 'deadline-driven' && '🎯'}
                    </div>
                    <div className="text-xs font-medium capitalize">{mode.replace('-', ' ')}</div>
                    <div className="text-[10px] text-text-muted mt-1">
                      {mode === 'relaxed' && '60% capacity'}
                      {mode === 'balanced' && '75% capacity'}
                      {mode === 'intense' && '90% capacity'}
                      {mode === 'deadline-driven' && '100%+ if needed'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Project Focus */}
            <div className="space-y-3">
              <h3 className="font-semibold text-text">🎯 Project Focus (Optional)</h3>
              <p className="text-sm text-text-secondary">
                Prioritize specific project(s) while still filling remaining time with other tasks.
              </p>
              <div className="flex flex-wrap gap-2">
                {projects.filter(p => p.status === 'active').map((project) => (
                  <button
                    key={project.id}
                    onClick={() => {
                      const current = config.focusProjects || [];
                      const updated = current.includes(project.id)
                        ? current.filter(id => id !== project.id)
                        : [...current, project.id];
                      setConfig({ ...config, focusProjects: updated });
                    }}
                    className={`px-3 py-2 rounded-lg border-2 flex items-center gap-2 transition-all ${
                      config.focusProjects?.includes(project.id)
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-text-muted'
                    }`}
                  >
                    <span 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: project.color || '#6366f1' }}
                    />
                    <span className="text-sm">{project.title}</span>
                  </button>
                ))}
              </div>
              
              {config.focusProjects && config.focusProjects.length > 0 && (
                <div className="mt-3">
                  <label className="block text-sm text-text-secondary mb-2">
                    Focus ratio: {Math.round((config.focusProjectRatio || 0.7) * 100)}% of time to focus projects
                  </label>
                  <input
                    type="range"
                    min="0.3"
                    max="0.9"
                    step="0.1"
                    value={config.focusProjectRatio || 0.7}
                    onChange={(e) => setConfig({ ...config, focusProjectRatio: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                </div>
              )}
            </div>
            
            {/* Deadline Settings */}
            <div className="space-y-3">
              <h3 className="font-semibold text-text">⏰ Deadline Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">
                    Buffer days before deadline
                  </label>
                  <select
                    value={config.deadlineBufferDays}
                    onChange={(e) => setConfig({ ...config, deadlineBufferDays: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text"
                  >
                    <option value={1}>1 day</option>
                    <option value={2}>2 days</option>
                    <option value={3}>3 days</option>
                    <option value={5}>5 days (conservative)</option>
                    <option value={7}>1 week (very safe)</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="strict-deadlines"
                    checked={config.strictDeadlines}
                    onChange={(e) => setConfig({ ...config, strictDeadlines: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="strict-deadlines" className="text-sm text-text">
                    Strict deadlines (never schedule past due date)
                  </label>
                </div>
              </div>
            </div>
            
            {/* Advanced Options */}
            <details className="group">
              <summary className="cursor-pointer font-semibold text-text flex items-center gap-2">
                <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Advanced Options
              </summary>
              <div className="mt-4 space-y-4 pl-6">
                {/* Overtime */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-text">Allow Overtime</label>
                    <p className="text-xs text-text-muted">Exceed normal hours if deadlines require it</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.allowOvertime}
                      onChange={(e) => setConfig({ ...config, allowOvertime: e.target.checked })}
                      className="w-4 h-4"
                    />
                    {config.allowOvertime && (
                      <select
                        value={config.maxOvertimeHours}
                        onChange={(e) => setConfig({ ...config, maxOvertimeHours: parseInt(e.target.value) })}
                        className="px-2 py-1 bg-surface border border-border rounded text-sm"
                      >
                        <option value={1}>+1 hour</option>
                        <option value={2}>+2 hours</option>
                        <option value={3}>+3 hours</option>
                        <option value={4}>+4 hours</option>
                      </select>
                    )}
                  </div>
                </div>
                
                {/* Breaks */}
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Break between tasks</label>
                  <select
                    value={config.breaksBetweenTasks}
                    onChange={(e) => setConfig({ ...config, breaksBetweenTasks: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text"
                  >
                    <option value={0}>No breaks</option>
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 minutes</option>
                    <option value={15}>15 minutes</option>
                  </select>
                </div>
                
                {/* Lunch Break */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text mb-1">Lunch Start</label>
                    <input
                      type="time"
                      value={config.lunchBreak?.start || '12:00'}
                      onChange={(e) => setConfig({ 
                        ...config, 
                        lunchBreak: { ...config.lunchBreak!, start: e.target.value }
                      })}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text mb-1">Lunch End</label>
                    <input
                      type="time"
                      value={config.lunchBreak?.end || '13:00'}
                      onChange={(e) => setConfig({ 
                        ...config, 
                        lunchBreak: { ...config.lunchBreak!, end: e.target.value }
                      })}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text"
                    />
                  </div>
                </div>
              </div>
            </details>
            
            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={handleAnalyze}>
                Analyze Schedule →
              </Button>
            </div>
          </div>
        )}
        
        {/* Step 2: Analysis */}
        {step === 'analyze' && analysis && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard 
                label="Tasks to Schedule" 
                value={analysis.schedulableTasks} 
                total={analysis.totalTasks}
                color="primary"
              />
              <StatCard 
                label="Time Needed" 
                value={`${Math.round(analysis.totalMinutesNeeded / 60)}h`}
                color="warning"
              />
              <StatCard 
                label="Time Available" 
                value={`${Math.round(analysis.totalMinutesAvailable / 60)}h`}
                color="success"
              />
              <StatCard 
                label="Utilization" 
                value={`${analysis.utilizationPercent}%`}
                color={analysis.utilizationPercent > 90 ? 'danger' : 'primary'}
              />
            </div>
            
            {/* Warnings */}
            {analysis.warnings.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-warning">⚠️ Warnings</h4>
                {analysis.warnings.map((warning, i) => (
                  <div key={i} className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-sm">
                    {warning}
                  </div>
                ))}
              </div>
            )}
            
            {/* Recommendations */}
            {analysis.recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-primary">💡 Recommendations</h4>
                {analysis.recommendations.map((rec, i) => (
                  <div key={i} className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm">
                    {rec}
                  </div>
                ))}
              </div>
            )}
            
            {/* Deadline Tasks */}
            {analysis.deadlineTasks.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-text">📅 Upcoming Deadlines</h4>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {analysis.deadlineTasks.slice(0, 10).map(({ task, daysUntilDue, canSchedule }) => (
                    <div 
                      key={task.id} 
                      className={`p-3 rounded-lg flex items-center justify-between ${
                        canSchedule ? 'bg-surface-hover' : 'bg-danger/10 border border-danger/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant={daysUntilDue < 3 ? 'danger' : daysUntilDue < 7 ? 'warning' : 'secondary'}>
                          {daysUntilDue <= 0 ? 'Overdue' : `${daysUntilDue}d`}
                        </Badge>
                        <span className="text-sm">{task.title}</span>
                      </div>
                      {!canSchedule && (
                        <span className="text-xs text-danger">⚠️ May miss deadline</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Actions */}
            <div className="flex justify-between pt-4 border-t border-border">
              <Button variant="ghost" onClick={() => setStep('configure')}>
                ← Back
              </Button>
              <Button 
                variant="primary" 
                onClick={handleGenerateSchedule}
                isLoading={isLoading}
              >
                Generate Schedule →
              </Button>
            </div>
          </div>
        )}
        
        {/* Step 3: Preview */}
        {step === 'preview' && previews.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-text">
                📆 Schedule Preview ({previews.reduce((sum, p) => sum + p.slots.length, 0)} tasks across {previews.length} days)
              </h3>
            </div>
            
            <div className="max-h-96 overflow-y-auto space-y-4">
              {previews.map((preview, i) => (
                <div key={i} className="border border-border rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-surface-hover font-medium text-sm flex items-center justify-between">
                    <span>
                      {preview.date.toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </span>
                    <span className="text-text-muted">{preview.slots.length} tasks</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {preview.slots.map((slot, j) => (
                      <div key={j} className="flex items-center gap-3 text-sm">
                        <span className="text-text-muted w-24">
                          {slot.startTime.toLocaleTimeString('en-US', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            hour12: false 
                          })}
                        </span>
                        <span className="flex-1">{slot.task.title}</span>
                        <Badge variant="secondary">
                          {slot.task.estimatedMinutes || 30}m
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Actions */}
            <div className="flex justify-between pt-4 border-t border-border">
              <Button variant="ghost" onClick={() => setStep('analyze')}>
                ← Back
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button 
                  variant="primary" 
                  onClick={handleApplySchedule}
                  isLoading={isLoading}
                >
                  ✅ Apply Schedule
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {/* Step 4: Applying */}
        {step === 'applying' && (
          <div className="py-12 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-text">Applying schedule...</p>
            <p className="text-sm text-text-muted">This may take a moment</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Helper Components
function StepIndicator({ 
  step, 
  current, 
  label, 
  active 
}: { 
  step: number; 
  current: Step; 
  label: string; 
  active: boolean 
}) {
  const stepOrder: Record<Step, number> = { configure: 1, analyze: 2, preview: 3, applying: 4 };
  const currentNum = stepOrder[current];
  const completed = currentNum > step;
  
  return (
    <div className={`flex items-center gap-2 ${active ? 'text-primary' : completed ? 'text-success' : 'text-text-muted'}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
        active ? 'bg-primary text-white' : completed ? 'bg-success text-white' : 'bg-surface-hover'
      }`}>
        {completed ? '✓' : step}
      </div>
      <span className="text-sm font-medium hidden sm:block">{label}</span>
    </div>
  );
}

function QuickRangeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1 text-xs bg-surface-hover hover:bg-surface rounded-full text-text-secondary hover:text-text transition-colors"
    >
      {label}
    </button>
  );
}

function StatCard({ 
  label, 
  value, 
  total, 
  color 
}: { 
  label: string; 
  value: string | number; 
  total?: number;
  color: 'primary' | 'warning' | 'success' | 'danger';
}) {
  const colorClasses = {
    primary: 'text-primary',
    warning: 'text-warning',
    success: 'text-success',
    danger: 'text-danger',
  };
  
  return (
    <div className="p-3 bg-surface-hover rounded-lg text-center">
      <div className={`text-xl font-bold ${colorClasses[color]}`}>
        {value}{total ? `/${total}` : ''}
      </div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}
