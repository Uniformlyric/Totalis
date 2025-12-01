interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  animation = 'pulse',
}: SkeletonProps) {
  const baseClasses = 'bg-surface-hover';
  
  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: '',
  };

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  // Default heights for text variant
  if (variant === 'text' && !height) {
    style.height = '1em';
  }

  return (
    <div
      className={`${baseClasses} ${animationClasses[animation]} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );
}

// Common skeleton patterns
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? '60%' : '100%'}
          height={16}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 border border-border rounded-xl space-y-4 ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="60%" height={16} />
          <Skeleton variant="text" width="40%" height={12} />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonTaskItem({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 p-3 ${className}`}>
      <Skeleton variant="circular" width={20} height={20} />
      <div className="flex-1 space-y-1">
        <Skeleton variant="text" width="70%" height={16} />
        <Skeleton variant="text" width="40%" height={12} />
      </div>
      <Skeleton variant="rectangular" width={60} height={24} />
    </div>
  );
}

export function SkeletonTaskList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonTaskItem key={i} />
      ))}
    </div>
  );
}

export function SkeletonStatsCard({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 border border-border rounded-xl ${className}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton variant="text" width={80} height={14} />
          <Skeleton variant="text" width={60} height={28} />
          <Skeleton variant="text" width={100} height={12} />
        </div>
        <Skeleton variant="rectangular" width={48} height={48} className="rounded-xl" />
      </div>
    </div>
  );
}

export function SkeletonStatsGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <SkeletonStatsCard />
      <SkeletonStatsCard />
      <SkeletonStatsCard />
      <SkeletonStatsCard />
    </div>
  );
}

export function SkeletonHabitItem({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 p-3 ${className}`}>
      <Skeleton variant="rectangular" width={24} height={24} className="rounded-lg" />
      <div className="flex-1">
        <Skeleton variant="text" width="50%" height={16} />
      </div>
      <Skeleton variant="rectangular" width={50} height={22} className="rounded-full" />
    </div>
  );
}

export function SkeletonProjectCard({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 border border-border rounded-xl space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width="60%" height={18} />
        <Skeleton variant="rectangular" width={60} height={22} className="rounded-full" />
      </div>
      <Skeleton variant="text" width="80%" height={14} />
      <div className="pt-2">
        <Skeleton variant="rectangular" width="100%" height={6} className="rounded-full" />
      </div>
      <div className="flex items-center justify-between pt-2">
        <Skeleton variant="text" width={80} height={12} />
        <Skeleton variant="text" width={60} height={12} />
      </div>
    </div>
  );
}

export function SkeletonGoalCard({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 border border-border rounded-xl space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1 space-y-1">
          <Skeleton variant="text" width="70%" height={18} />
          <Skeleton variant="text" width="40%" height={12} />
        </div>
      </div>
      <Skeleton variant="rectangular" width="100%" height={8} className="rounded-full" />
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={100} height={14} />
        <Skeleton variant="rectangular" width={80} height={26} className="rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonNoteCard({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 border border-border rounded-xl space-y-3 ${className}`}>
      <Skeleton variant="text" width="70%" height={18} />
      <SkeletonText lines={3} />
      <div className="flex items-center gap-2 pt-2">
        <Skeleton variant="rectangular" width={60} height={20} className="rounded-full" />
        <Skeleton variant="rectangular" width={50} height={20} className="rounded-full" />
      </div>
    </div>
  );
}

// Full page skeleton layouts
export function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton variant="text" width={200} height={28} />
          <Skeleton variant="text" width={150} height={16} />
        </div>
        <Skeleton variant="rectangular" width={100} height={40} className="rounded-lg" />
      </div>

      {/* Stats */}
      <SkeletonStatsGrid />

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Skeleton variant="text" width={120} height={20} />
          <SkeletonTaskList count={4} />
        </div>
        <div className="space-y-4">
          <Skeleton variant="text" width={100} height={20} />
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonHabitItem key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
