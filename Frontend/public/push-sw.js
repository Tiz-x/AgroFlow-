// public/push-sw.js
// Push notification service worker with localStorage storage

// ── Store notification in localStorage ──────────────────────────────
function storeNotification(notification) {
  try {
    // Get existing notifications from localStorage
    const stored = localStorage.getItem('agroflow_notifications');
    let notifications = stored ? JSON.parse(stored) : [];
    
    // Add new notification
    notifications.unshift({
      id: notification.id || Date.now().toString(),
      title: notification.title || 'AgroFlow+',
      body: notification.body || 'You have a new notification',
      timestamp: notification.timestamp || Date.now(),
      read: false,
      data: notification.data || {}
    });
    
    // Keep only last 100 notifications
    if (notifications.length > 100) {
      notifications = notifications.slice(0, 100);
    }
    
    // Save back to localStorage
    localStorage.setItem('agroflow_notifications', JSON.stringify(notifications));
    
    // Dispatch a custom event so the app can react
    window.dispatchEvent(new CustomEvent('notification-stored', {
      detail: { notification }
    }));
    
    console.log('[Push SW] Notification stored in localStorage:', notification.title);
  } catch (error) {
    console.error('[Push SW] Failed to store notification:', error);
  }
}

// ── Send notification to all open windows ──────────────────────────
function sendToClients(notification) {
  return clients.matchAll({ type: 'window' }).then(clientList => {
    clientList.forEach(client => {
      client.postMessage({
        type: 'PUSH_NOTIFICATION',
        payload: {
          id: notification.id || Date.now().toString(),
          title: notification.title || 'AgroFlow+',
          body: notification.body || 'You have a new notification',
          timestamp: notification.timestamp || Date.now(),
          read: false,
          data: notification.data || {}
        }
      });
    });
  });
}

// ── Push event handler ──────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  let data;
  try {
    data = event.data.json();
  } catch (error) {
    console.error('[Push SW] Failed to parse push data:', error);
    return;
  }
  
  const notification = {
    id: data.id || Date.now().toString(),
    title: data.title || 'AgroFlow+',
    body: data.body || 'You have a new notification',
    timestamp: Date.now(),
    read: false,
    data: {
      url: data.url || '/',
      tag: data.tag || 'agroflow',
      ...data.data
    }
  };
  
  event.waitUntil(
    Promise.all([
      // Store in localStorage
      storeNotification(notification),
      
      // Send to all open windows
      sendToClients(notification),
      
      // Show system notification
      self.registration.showNotification(notification.title, {
        body: notification.body,
        icon: data.icon || '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        tag: data.tag || 'agroflow',
        data: { url: data.url || '/' },
        vibrate: [200, 100, 200],
        image: data.image || undefined,
        actions: [
          {
            action: 'open',
            title: 'View',
          },
          {
            action: 'close',
            title: 'Dismiss',
          },
        ],
      })
    ])
  );
});

// ── Notification click handler ──────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || '/')
    );
  } else if (event.action === 'close') {
    // Just close the notification
    return;
  } else {
    // Default - open the app
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        const url = event.notification.data?.url || '/';
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});

// ── Message handler for getting stored notifications ──────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_NOTIFICATIONS') {
    try {
      const stored = localStorage.getItem('agroflow_notifications');
      const notifications = stored ? JSON.parse(stored) : [];
      event.ports[0].postMessage({ notifications });
    } catch (error) {
      console.error('[Push SW] Failed to get notifications:', error);
      event.ports[0].postMessage({ notifications: [], error: error.message });
    }
  }
  
  if (event.data && event.data.type === 'MARK_NOTIFICATION_READ') {
    try {
      const { id } = event.data;
      const stored = localStorage.getItem('agroflow_notifications');
      let notifications = stored ? JSON.parse(stored) : [];
      
      notifications = notifications.map(n => 
        n.id === id ? { ...n, read: true } : n
      );
      
      localStorage.setItem('agroflow_notifications', JSON.stringify(notifications));
      event.ports[0].postMessage({ success: true });
    } catch (error) {
      console.error('[Push SW] Failed to mark notification as read:', error);
      event.ports[0].postMessage({ success: false, error: error.message });
    }
  }
  
  if (event.data && event.data.type === 'MARK_ALL_READ') {
    try {
      const stored = localStorage.getItem('agroflow_notifications');
      let notifications = stored ? JSON.parse(stored) : [];
      
      notifications = notifications.map(n => ({ ...n, read: true }));
      
      localStorage.setItem('agroflow_notifications', JSON.stringify(notifications));
      event.ports[0].postMessage({ success: true });
    } catch (error) {
      console.error('[Push SW] Failed to mark all as read:', error);
      event.ports[0].postMessage({ success: false, error: error.message });
    }
  }
});

// ── Log service worker installation ──────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[Push SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Push SW] Activating...');
  event.waitUntil(clients.claim());
});