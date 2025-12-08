/**
 * Google Calendar Integration
 * Handles OAuth, event fetching (for blocking time), and event creation (for syncing schedule)
 */

import { getDb } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

// Google Calendar API scopes
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

const GOOGLE_CLIENT_ID = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID || '';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  colorId?: string;
  source: 'google' | 'totalis';
}

export interface GoogleCalendarIntegration {
  connected: boolean;
  email?: string;
  accessToken?: string;
  tokenExpiry?: number;
  calendarId?: string; // Primary calendar or selected calendar
  syncEnabled: boolean;
  lastSyncAt?: Date;
}

/**
 * Get the current Google Calendar integration status
 */
export async function getCalendarIntegration(userId: string): Promise<GoogleCalendarIntegration | null> {
  try {
    const db = getDb();
    const integrationRef = doc(db, 'users', userId, 'integrations', 'googleCalendar');
    const integrationDoc = await getDoc(integrationRef);
    
    if (!integrationDoc.exists()) {
      return null;
    }
    
    return integrationDoc.data() as GoogleCalendarIntegration;
  } catch (error) {
    console.error('Failed to get calendar integration:', error);
    return null;
  }
}

/**
 * Initialize Google OAuth for Calendar access
 */
export async function initGoogleCalendarOAuth(userId: string): Promise<GoogleCalendarIntegration> {
  return new Promise((resolve, reject) => {
    // Load Google Identity Services
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      // @ts-ignore - Google Identity Services
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: CALENDAR_SCOPES.join(' '),
        callback: async (response: any) => {
          if (response.error) {
            console.error('Calendar OAuth error:', response.error);
            reject(new Error(response.error));
            return;
          }
          
          try {
            // Get user's email
            const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${response.access_token}` },
            });
            const userData = await userInfo.json();
            
            // Save integration to Firestore
            const db = getDb();
            const integration: GoogleCalendarIntegration = {
              connected: true,
              email: userData.email,
              accessToken: response.access_token,
              tokenExpiry: Date.now() + (response.expires_in * 1000),
              calendarId: 'primary',
              syncEnabled: true,
              lastSyncAt: new Date(),
            };
            
            await setDoc(
              doc(db, 'users', userId, 'integrations', 'googleCalendar'),
              integration
            );
            
            resolve(integration);
          } catch (error) {
            console.error('Failed to save calendar integration:', error);
            reject(error);
          }
        },
      });
      
      tokenClient.requestAccessToken();
    };
    
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Disconnect Google Calendar integration
 */
export async function disconnectCalendar(userId: string): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, 'users', userId, 'integrations', 'googleCalendar'), {
    connected: false,
    accessToken: null,
    tokenExpiry: null,
    syncEnabled: false,
  });
}

/**
 * Fetch events from Google Calendar for a date range
 * These events will be treated as "blocked time" by the auto-scheduler
 */
export async function fetchCalendarEvents(
  accessToken: string,
  startDate: Date,
  endDate: Date,
  calendarId: string = 'primary'
): Promise<CalendarEvent[]> {
  const timeMin = startDate.toISOString();
  const timeMax = endDate.toISOString();
  
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
    `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch calendar events: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  return (data.items || []).map((event: any) => ({
    id: event.id,
    title: event.summary || '(No title)',
    description: event.description,
    start: new Date(event.start.dateTime || event.start.date),
    end: new Date(event.end.dateTime || event.end.date),
    allDay: !event.start.dateTime,
    location: event.location,
    colorId: event.colorId,
    source: 'google' as const,
  }));
}

/**
 * Create an event in Google Calendar (for syncing Totalis schedule)
 */
export async function createCalendarEvent(
  accessToken: string,
  event: {
    title: string;
    description?: string;
    start: Date;
    end: Date;
    colorId?: string;
  },
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: event.title,
        description: event.description || 'Scheduled by Totalis',
        start: { dateTime: event.start.toISOString() },
        end: { dateTime: event.end.toISOString() },
        colorId: event.colorId,
      }),
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to create calendar event: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  return {
    id: data.id,
    title: data.summary,
    description: data.description,
    start: new Date(data.start.dateTime),
    end: new Date(data.end.dateTime),
    allDay: false,
    source: 'totalis',
  };
}

/**
 * Delete an event from Google Calendar
 */
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
  calendarId: string = 'primary'
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete calendar event: ${response.statusText}`);
  }
}

/**
 * Sync Totalis scheduled tasks to Google Calendar
 */
export async function syncScheduleToCalendar(
  accessToken: string,
  tasks: Array<{
    id: string;
    title: string;
    scheduledStart: Date;
    scheduledEnd?: Date;
    estimatedMinutes?: number;
    projectTitle?: string;
  }>,
  calendarId: string = 'primary'
): Promise<number> {
  let syncedCount = 0;
  
  for (const task of tasks) {
    try {
      const endTime = task.scheduledEnd || new Date(task.scheduledStart.getTime() + (task.estimatedMinutes || 30) * 60000);
      
      await createCalendarEvent(accessToken, {
        title: `📋 ${task.title}`,
        description: task.projectTitle ? `Project: ${task.projectTitle}\n\nScheduled by Totalis` : 'Scheduled by Totalis',
        start: task.scheduledStart,
        end: endTime,
        colorId: '7', // Peacock (cyan) color for Totalis tasks
      }, calendarId);
      
      syncedCount++;
    } catch (error) {
      console.error(`Failed to sync task ${task.id}:`, error);
    }
  }
  
  return syncedCount;
}

/**
 * Get blocked time slots from calendar events
 * Used by auto-scheduler to avoid double-booking
 */
export function getBlockedTimeSlots(
  events: CalendarEvent[],
  date: Date
): Array<{ start: number; end: number }> {
  const dateStr = date.toISOString().split('T')[0];
  
  return events
    .filter(event => {
      if (event.allDay) return false;
      const eventDateStr = event.start.toISOString().split('T')[0];
      return eventDateStr === dateStr;
    })
    .map(event => ({
      start: event.start.getHours() * 60 + event.start.getMinutes(),
      end: event.end.getHours() * 60 + event.end.getMinutes(),
    }))
    .sort((a, b) => a.start - b.start);
}
