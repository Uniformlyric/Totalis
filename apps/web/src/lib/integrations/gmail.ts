/**
 * Gmail Integration Service
 * Handles OAuth, email fetching, and tracking processed emails
 */

import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';

// Gmail API configuration
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

const GOOGLE_CLIENT_ID = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID || '';

export interface GmailEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: Date;
  snippet: string;
  body: string;
  labels: string[];
  isRead: boolean;
}

export interface GmailConnectionStatus {
  connected: boolean;
  email?: string;
  accessToken?: string;
  expiresAt?: Date;
  lastSyncAt?: Date;
}

/**
 * Initialize Google OAuth for Gmail access
 */
export async function connectGmail(): Promise<{ accessToken: string; email: string } | null> {
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
        scope: GMAIL_SCOPES.join(' '),
        callback: async (response: any) => {
          if (response.error) {
            console.error('Gmail OAuth error:', response.error);
            reject(new Error(response.error));
            return;
          }
          
          // Get user email from token
          try {
            const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${response.access_token}` }
            });
            
            if (!userInfo.ok) {
              console.error('Failed to get user info:', userInfo.status);
              // Still resolve with token, but use placeholder email
              resolve({
                accessToken: response.access_token,
                email: 'connected@gmail.com',
              });
              return;
            }
            
            const userData = await userInfo.json();
            
            resolve({
              accessToken: response.access_token,
              email: userData.email || 'connected@gmail.com',
            });
          } catch (err) {
            console.error('Error getting user info:', err);
            // Still resolve - we have the token
            resolve({
              accessToken: response.access_token,
              email: 'connected@gmail.com',
            });
          }
        },
      });
      
      tokenClient.requestAccessToken({ prompt: 'consent' });
    };
    
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Save Gmail connection to Firestore
 */
export async function saveGmailConnection(
  userId: string,
  accessToken: string,
  email: string
): Promise<void> {
  const db = getDb();
  const gmailRef = doc(db, 'users', userId, 'integrations', 'gmail');
  
  await setDoc(gmailRef, {
    connected: true,
    email,
    accessToken,
    connectedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour token
    lastSyncAt: null,
  }, { merge: true });
}

/**
 * Get Gmail connection status
 */
export async function getGmailStatus(userId: string): Promise<GmailConnectionStatus> {
  const db = getDb();
  const gmailRef = doc(db, 'users', userId, 'integrations', 'gmail');
  const gmailDoc = await getDoc(gmailRef);
  
  if (!gmailDoc.exists()) {
    return { connected: false };
  }
  
  const data = gmailDoc.data();
  const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);
  
  // Check if token is expired (with 5 minute buffer)
  const isExpired = expiresAt && new Date() > new Date(expiresAt.getTime() - 5 * 60 * 1000);
  
  return {
    connected: data.connected && !isExpired,
    email: data.email,
    accessToken: isExpired ? undefined : data.accessToken,
    expiresAt,
    lastSyncAt: data.lastSyncAt?.toDate?.() || null,
  };
}

/**
 * Disconnect Gmail
 */
export async function disconnectGmail(userId: string): Promise<void> {
  const db = getDb();
  const gmailRef = doc(db, 'users', userId, 'integrations', 'gmail');
  
  await setDoc(gmailRef, {
    connected: false,
    accessToken: null,
    email: null,
  }, { merge: true });
}

/**
 * Get list of already processed email IDs
 */
export async function getProcessedEmailIds(userId: string): Promise<Set<string>> {
  const db = getDb();
  const processedRef = doc(db, 'users', userId, 'integrations', 'processedEmails');
  const processedDoc = await getDoc(processedRef);
  
  if (!processedDoc.exists()) {
    return new Set();
  }
  
  return new Set(processedDoc.data().emailIds || []);
}

/**
 * Mark email IDs as processed
 */
export async function markEmailsAsProcessed(userId: string, emailIds: string[]): Promise<void> {
  const db = getDb();
  const processedRef = doc(db, 'users', userId, 'integrations', 'processedEmails');
  
  // Use arrayUnion to add new IDs without duplicates
  await setDoc(processedRef, {
    emailIds: arrayUnion(...emailIds),
    lastUpdated: new Date(),
  }, { merge: true });
}

/**
 * Fetch emails from Gmail API
 */
export async function fetchEmails(
  accessToken: string,
  options: {
    maxResults?: number;
    afterDate?: Date;
    excludeCategories?: string[];
  } = {}
): Promise<GmailEmail[]> {
  const { maxResults = 100, afterDate, excludeCategories = ['promotions', 'social', 'forums'] } = options;
  
  // Build query to filter out noise
  let query = 'in:inbox';
  
  if (afterDate) {
    const dateStr = afterDate.toISOString().split('T')[0].replace(/-/g, '/');
    query += ` after:${dateStr}`;
  }
  
  // Exclude promotional categories
  excludeCategories.forEach(cat => {
    query += ` -category:${cat}`;
  });
  
  // Exclude common newsletter patterns
  query += ' -from:noreply -from:no-reply -from:newsletter -from:notifications -from:mailer';
  
  try {
    // Fetch message list
    const listResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(error.error?.message || 'Failed to fetch emails');
    }
    
    const listData = await listResponse.json();
    const messages = listData.messages || [];
    
    if (messages.length === 0) {
      return [];
    }
    
    // Fetch full message details in batches
    const emails: GmailEmail[] = [];
    const batchSize = 20;
    
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (msg: { id: string }) => {
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        
        if (!msgResponse.ok) return null;
        
        const msgData = await msgResponse.json();
        return parseGmailMessage(msgData);
      });
      
      const batchResults = await Promise.all(batchPromises);
      emails.push(...batchResults.filter((e): e is GmailEmail => e !== null));
      
      // Small delay to avoid rate limiting
      if (i + batchSize < messages.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return emails;
  } catch (error) {
    console.error('Error fetching emails:', error);
    throw error;
  }
}

/**
 * Parse Gmail API message format into our GmailEmail type
 */
function parseGmailMessage(message: any): GmailEmail {
  const headers = message.payload?.headers || [];
  
  const getHeader = (name: string): string => {
    const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
    return header?.value || '';
  };
  
  // Extract body - handle different MIME types
  let body = '';
  
  const extractBody = (part: any): string => {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      for (const subPart of part.parts) {
        const text = extractBody(subPart);
        if (text) return text;
      }
    }
    return '';
  };
  
  if (message.payload) {
    body = extractBody(message.payload);
    
    // Fallback to snippet if no plain text body found
    if (!body && message.snippet) {
      body = message.snippet;
    }
  }
  
  // Truncate very long bodies to save tokens
  if (body.length > 3000) {
    body = body.substring(0, 3000) + '\n[... truncated ...]';
  }
  
  return {
    id: message.id,
    threadId: message.threadId,
    subject: getHeader('Subject') || '(No Subject)',
    from: getHeader('From'),
    to: getHeader('To'),
    date: new Date(parseInt(message.internalDate)),
    snippet: message.snippet || '',
    body,
    labels: message.labelIds || [],
    isRead: !message.labelIds?.includes('UNREAD'),
  };
}

/**
 * Decode base64url encoded string
 */
function decodeBase64Url(data: string): string {
  try {
    // Replace URL-safe characters
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return atob(base64);
  } catch {
    return '';
  }
}

/**
 * Update last sync timestamp
 */
export async function updateLastSync(userId: string): Promise<void> {
  const db = getDb();
  const gmailRef = doc(db, 'users', userId, 'integrations', 'gmail');
  
  await updateDoc(gmailRef, {
    lastSyncAt: new Date(),
  });
}

/**
 * Calculate date ranges for scanning
 */
export function getScanDateRange(mode: 'week' | '3months'): Date {
  const now = new Date();
  
  if (mode === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }
}

/**
 * GmailService class - convenient wrapper for Gmail operations
 */
export class GmailService {
  private userId: string;
  private status: GmailConnectionStatus | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  async getConnectionStatus(): Promise<GmailConnectionStatus> {
    this.status = await getGmailStatus(this.userId);
    return this.status;
  }

  async connect(): Promise<GmailConnectionStatus> {
    try {
      const result = await connectGmail();
      if (result) {
        await saveGmailConnection(this.userId, result.accessToken, result.email);
        this.status = {
          connected: true,
          email: result.email,
          accessToken: result.accessToken,
        };
        return this.status;
      }
      return { connected: false };
    } catch (error) {
      console.error('Gmail connect error:', error);
      return { connected: false };
    }
  }

  async disconnect(): Promise<void> {
    await disconnectGmail(this.userId);
    this.status = { connected: false };
  }

  async fetchEmails(startDate: Date, endDate: Date): Promise<GmailEmail[]> {
    // Get fresh status to ensure we have valid token
    const status = await this.getConnectionStatus();
    
    if (!status.connected || !status.accessToken) {
      throw new Error('Gmail session expired. Please reconnect your Gmail account.');
    }

    // Get already processed email IDs
    const processedIds = await getProcessedEmailIds(this.userId);
    
    // Fetch emails
    try {
      const emails = await fetchEmails(status.accessToken, {
        afterDate: startDate,
        maxResults: 200,
      });

      // Filter out already processed emails
      const newEmails = emails.filter(email => !processedIds.has(email.id));
      
      return newEmails;
    } catch (error) {
      // If we get a 401, the token is invalid - disconnect so user can reconnect
      if (error instanceof Error && error.message.includes('authentication')) {
        await disconnectGmail(this.userId);
        throw new Error('Gmail session expired. Please reconnect your Gmail account.');
      }
      throw error;
    }
  }

  async markEmailsAsProcessed(emailIds: string[]): Promise<void> {
    await markEmailsAsProcessed(this.userId, emailIds);
    await updateLastSync(this.userId);
  }
}
