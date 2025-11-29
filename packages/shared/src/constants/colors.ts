export const themes = {
  celestial: {
    name: 'Celestial',
    isDark: true,
    colors: {
      bg: '#0a0e17',
      surface: '#141b2d',
      surfaceHover: '#1e293b',
      primary: '#6366f1',
      secondary: '#8b5cf6',
      accent: '#22d3ee',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      border: '#1e293b',
    },
  },
  sunset: {
    name: 'Sunset',
    isDark: false,
    colors: {
      bg: '#fefcf9',
      surface: '#fff7ed',
      surfaceHover: '#ffedd5',
      primary: '#f97316',
      secondary: '#ec4899',
      accent: '#eab308',
      success: '#22c55e',
      warning: '#f59e0b',
      danger: '#dc2626',
      text: '#1c1917',
      textSecondary: '#78716c',
      textMuted: '#a8a29e',
      border: '#e7e5e4',
    },
  },
} as const;

export type ThemeName = keyof typeof themes;
