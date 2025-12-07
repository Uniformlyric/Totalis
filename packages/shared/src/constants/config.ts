export const config = {
  app: {
    name: 'Totalis',
    tagline: 'Total clarity. Total control. Total productivity.',
    version: '1.0.0',
  },
  api: {
    gemini: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-2.0-flash',
    },
  },
  notifications: {
    morningTime: '08:00',
    eveningTime: '21:00',
    reminderCheckInterval: 5,
  },
  defaults: {
    workingHours: { start: '09:00', end: '17:00' },
    workingDays: [1, 2, 3, 4, 5], // Mon-Fri
    pomodoroDuration: 25,
    breakDuration: 5,
  },
} as const;
