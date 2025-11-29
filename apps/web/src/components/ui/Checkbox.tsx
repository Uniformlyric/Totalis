import { useState } from 'react';

export interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeStyles = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

const iconSizes = {
  sm: 12,
  md: 14,
  lg: 16,
};

export function Checkbox({
  checked = false,
  onChange,
  label,
  disabled = false,
  size = 'md',
  className = '',
}: CheckboxProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleChange = () => {
    if (disabled) return;
    setIsAnimating(true);
    onChange?.(!checked);
    setTimeout(() => setIsAnimating(false), 200);
  };

  return (
    <label
      className={`
        inline-flex items-center gap-2 cursor-pointer
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={handleChange}
        disabled={disabled}
        className={`
          ${sizeStyles[size]}
          rounded-md border-2 flex items-center justify-center
          transition-all duration-[--transition-fast]
          ${
            checked
              ? 'bg-primary border-primary'
              : 'border-border hover:border-text-muted'
          }
          ${isAnimating ? 'animate-check-bounce' : ''}
          ${className}
        `}
      >
        {checked && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={iconSizes[size]}
            height={iconSizes[size]}
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      {label && (
        <span
          className={`text-text ${checked ? 'line-through text-text-muted' : ''}`}
        >
          {label}
        </span>
      )}
    </label>
  );
}
