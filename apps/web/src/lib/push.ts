// Push Notification Service
// Handles browser push notification permissions and subscriptions

const VAPID_PUBLIC_KEY = import.meta.env.PUBLIC_VAPID_PUBLIC_KEY;

// Convert VAPID key from base64 to Uint8Array for subscription
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Helper to convert Uint8Array to ArrayBuffer for pushManager
function toArrayBuffer(uint8Array: Uint8Array): ArrayBuffer {
  return uint8Array.buffer.slice(
    uint8Array.byteOffset,
    uint8Array.byteOffset + uint8Array.byteLength
  ) as ArrayBuffer;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
}

export type NotificationPermission = 'default' | 'granted' | 'denied';

/**
 * Check if push notifications are supported in this browser
 */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 
         'PushManager' in window && 
         'Notification' in window;
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission as NotificationPermission;
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported');
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  return permission as NotificationPermission;
}

/**
 * Get the service worker registration
 */
async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  
  try {
    // Check for existing registration
    let registration = await navigator.serviceWorker.getRegistration();
    
    if (!registration) {
      // Register service worker if not already registered
      registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('[Push] Service worker registered');
    }

    // Wait for the service worker to be ready with a timeout
    const readyPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Service worker ready timeout')), 5000)
    );
    
    await Promise.race([readyPromise, timeoutPromise]);
    
    return registration;
  } catch (err) {
    console.error('[Push] Service worker registration failed:', err);
    return null;
  }
}

/**
 * Check if we're running on localhost (push may not work)
 */
export function isLocalhost(): boolean {
  return typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
}

/**
 * Subscribe to push notifications
 * Returns the subscription data that should be saved to Firestore
 */
export async function subscribeToPush(): Promise<PushSubscriptionData | null> {
  if (!isPushSupported()) {
    console.warn('[Push] Push notifications not supported');
    return null;
  }

  if (!VAPID_PUBLIC_KEY) {
    console.error('[Push] VAPID public key not configured');
    return null;
  }

  // Request permission first
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    console.log('[Push] Permission not granted:', permission);
    return null;
  }

  try {
    const registration = await getServiceWorkerRegistration();
    if (!registration) {
      throw new Error('Service worker registration failed');
    }

    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Create new subscription with timeout
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      
      // Add timeout to prevent hanging (especially on localhost)
      const subscribePromise = registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toArrayBuffer(applicationServerKey)
      });
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Push subscription timeout')), 10000)
      );
      
      subscription = await Promise.race([subscribePromise, timeoutPromise]);
      console.log('[Push] Subscription created successfully');
    }

    // Extract subscription data
    const subscriptionJson = subscription.toJSON();
    
    if (!subscriptionJson.endpoint || !subscriptionJson.keys) {
      throw new Error('Invalid subscription data');
    }

    const subscriptionData: PushSubscriptionData = {
      endpoint: subscriptionJson.endpoint,
      keys: {
        p256dh: subscriptionJson.keys.p256dh!,
        auth: subscriptionJson.keys.auth!
      },
      expirationTime: subscriptionJson.expirationTime ?? null
    };

    console.log('[Push] Subscription ready:', subscriptionData.endpoint.slice(0, 50) + '...');
    return subscriptionData;
  } catch (err) {
    console.error('[Push] Subscription failed:', err);
    return null;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await getServiceWorkerRegistration();
    if (!registration) return false;

    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      console.log('[Push] Unsubscribed from push notifications');
      return true;
    }
    return false;
  } catch (err) {
    console.error('[Push] Unsubscribe failed:', err);
    return false;
  }
}

/**
 * Check if user is currently subscribed to push notifications
 */
export async function isPushSubscribed(): Promise<boolean> {
  try {
    const registration = await getServiceWorkerRegistration();
    if (!registration) return false;

    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch (err) {
    console.error('[Push] Check subscription failed:', err);
    return false;
  }
}

/**
 * Show a local notification (for testing)
 */
export async function showLocalNotification(
  title: string,
  options?: NotificationOptions
): Promise<void> {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported');
    return;
  }

  if (Notification.permission !== 'granted') {
    console.warn('Notification permission not granted');
    return;
  }

  const registration = await getServiceWorkerRegistration();
  if (registration) {
    await registration.showNotification(title, {
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      ...options
    });
  }
}
