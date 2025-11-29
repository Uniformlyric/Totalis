import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'celestial' | 'sunset' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  getEffectiveTheme: () => 'celestial' | 'sunset';
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'celestial',
      
      setTheme: (theme: Theme) => {
        set({ theme });
        
        // Apply theme to document
        if (theme === 'sunset') {
          document.documentElement.setAttribute('data-theme', 'sunset');
        } else if (theme === 'system') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          if (prefersDark) {
            document.documentElement.removeAttribute('data-theme');
          } else {
            document.documentElement.setAttribute('data-theme', 'sunset');
          }
        } else {
          document.documentElement.removeAttribute('data-theme');
        }
      },
      
      getEffectiveTheme: () => {
        const { theme } = get();
        if (theme === 'system') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'celestial'
            : 'sunset';
        }
        return theme;
      },
    }),
    {
      name: 'totalis-theme',
    }
  )
);
