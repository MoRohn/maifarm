import React, { useEffect, useState, useCallback } from 'react';
import { Bell, BellOff, Check, X, AlertCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface NotificationPreferences {
  enabled: boolean;
  agentCompleted: boolean;
  harvestReady: boolean;
  errorAlerts: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

interface PushNotification {
  id: string;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  timestamp: Date;
  data?: any;
  type: 'success' | 'error' | 'info' | 'warning';
}

export const MobilePushNotifications: React.FC = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    enabled: false,
    agentCompleted: true,
    harvestReady: true,
    errorAlerts: true,
    soundEnabled: true,
    vibrationEnabled: true
  });
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  // Initialize service worker for push notifications
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      initializeServiceWorker();
    }
  }, []);

  const initializeServiceWorker = async () => {
    try {
      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration);
      
      // Wait for service worker to be ready
      const sw = await navigator.serviceWorker.ready;
      setServiceWorkerReady(true);
      
      // Check if already subscribed
      const existingSubscription = await sw.pushManager.getSubscription();
      if (existingSubscription) {
        setSubscription(existingSubscription);
        setPreferences(prev => ({ ...prev, enabled: true }));
      }
      
      // Check notification permission
      setPermission(Notification.permission);
      
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  };

  // Request notification permission
  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications');
      return;
    }
    
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        await subscribeToPush();
      }
    } catch (error) {
      console.error('Permission request failed:', error);
    }
  };

  // Subscribe to push notifications
  const subscribeToPush = async () => {
    if (!serviceWorkerReady) {
      console.error('Service Worker not ready');
      return;
    }
    
    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Create subscription
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.REACT_APP_VAPID_PUBLIC_KEY || 'your-vapid-public-key'
        )
      });
      
      setSubscription(subscription);
      setPreferences(prev => ({ ...prev, enabled: true }));
      
      // Send subscription to server
      await sendSubscriptionToServer(subscription);
      
      // Show success notification
      showNotification({
        title: 'Notifications Enabled',
        body: 'You will now receive MaiFarm notifications',
        type: 'success'
      });
      
    } catch (error) {
      console.error('Push subscription failed:', error);
    }
  };

  // Unsubscribe from push notifications
  const unsubscribeFromPush = async () => {
    if (!subscription) return;
    
    try {
      await subscription.unsubscribe();
      setSubscription(null);
      setPreferences(prev => ({ ...prev, enabled: false }));
      
      // Remove subscription from server
      await removeSubscriptionFromServer();
      
    } catch (error) {
      console.error('Unsubscribe failed:', error);
    }
  };

  // Send subscription to server
  const sendSubscriptionToServer = async (subscription: PushSubscription) => {
    try {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          preferences
        })
      });
    } catch (error) {
      console.error('Failed to send subscription to server:', error);
    }
  };

  // Remove subscription from server
  const removeSubscriptionFromServer = async () => {
    try {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Failed to remove subscription from server:', error);
    }
  };

  // Show notification
  const showNotification = useCallback((options: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: any;
    type: 'success' | 'error' | 'info' | 'warning';
  }) => {
    const notification: PushNotification = {
      id: `notif-${Date.now()}`,
      timestamp: new Date(),
      ...options
    };
    
    // Add to local notifications list
    setNotifications(prev => [notification, ...prev].slice(0, 50));
    
    // Show browser notification if permitted
    if (permission === 'granted' && preferences.enabled) {
      const notificationOptions: NotificationOptions = {
        body: options.body,
        icon: options.icon || '/icon-192x192.png',
        badge: options.badge || '/badge.png',
        tag: options.tag,
        data: options.data,
        vibrate: preferences.vibrationEnabled ? [200, 100, 200] : undefined,
        silent: !preferences.soundEnabled,
        requireInteraction: options.type === 'error',
        actions: [
          { action: 'view', title: 'View' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
      };
      
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Send to service worker
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title: options.title,
          options: notificationOptions
        });
      } else {
        // Fallback to Notification API
        new Notification(options.title, notificationOptions);
      }
    }
    
    // Vibrate if enabled
    if (preferences.vibrationEnabled && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
    
    // Play sound if enabled
    if (preferences.soundEnabled) {
      playNotificationSound(options.type);
    }
  }, [permission, preferences]);

  // Play notification sound
  const playNotificationSound = (type: string) => {
    const audio = new Audio();
    switch (type) {
      case 'success':
        audio.src = '/sounds/success.mp3';
        break;
      case 'error':
        audio.src = '/sounds/error.mp3';
        break;
      default:
        audio.src = '/sounds/notification.mp3';
    }
    audio.play().catch(e => console.log('Audio play failed:', e));
  };

  // Handle incoming messages from service worker
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'NOTIFICATION_CLICKED') {
        // Handle notification click
        const { action, notification } = event.data;
        if (action === 'view') {
          // Navigate to relevant page
          window.location.href = notification.data?.url || '/';
        }
      }
    };
    
    navigator.serviceWorker.addEventListener('message', handleMessage);
    
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  // Update preferences
  const updatePreference = (key: keyof NotificationPreferences, value: boolean) => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    
    // Update server preferences
    if (subscription) {
      sendSubscriptionToServer(subscription);
    }
  };

  // Clear all notifications
  const clearNotifications = () => {
    setNotifications([]);
  };

  // Remove single notification
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="mobile-push-notifications p-4">
      {/* Permission Request */}
      {permission === 'default' && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-600 text-white p-4 rounded-lg mb-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-6 h-6" />
              <div>
                <h3 className="font-semibold">Enable Notifications</h3>
                <p className="text-sm opacity-90">
                  Get alerts when agents complete tasks
                </p>
              </div>
            </div>
            <button
              onClick={requestPermission}
              className="px-4 py-2 bg-white text-blue-600 rounded-lg font-medium"
            >
              Enable
            </button>
          </div>
        </motion.div>
      )}
      
      {/* Notification Settings */}
      {permission === 'granted' && (
        <div className="bg-gray-900 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Notification Settings</h3>
            <button
              onClick={() => updatePreference('enabled', !preferences.enabled)}
              className={`p-2 rounded ${
                preferences.enabled ? 'bg-green-600' : 'bg-gray-700'
              }`}
            >
              {preferences.enabled ? (
                <Bell className="w-4 h-4 text-white" />
              ) : (
                <BellOff className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
          
          <div className="space-y-3">
            <label className="flex items-center justify-between text-gray-300">
              <span>Agent Completed</span>
              <input
                type="checkbox"
                checked={preferences.agentCompleted}
                onChange={(e) => updatePreference('agentCompleted', e.target.checked)}
                className="toggle"
              />
            </label>
            
            <label className="flex items-center justify-between text-gray-300">
              <span>Harvest Ready</span>
              <input
                type="checkbox"
                checked={preferences.harvestReady}
                onChange={(e) => updatePreference('harvestReady', e.target.checked)}
                className="toggle"
              />
            </label>
            
            <label className="flex items-center justify-between text-gray-300">
              <span>Error Alerts</span>
              <input
                type="checkbox"
                checked={preferences.errorAlerts}
                onChange={(e) => updatePreference('errorAlerts', e.target.checked)}
                className="toggle"
              />
            </label>
            
            <div className="border-t border-gray-700 pt-3">
              <label className="flex items-center justify-between text-gray-300">
                <span>Sound</span>
                <input
                  type="checkbox"
                  checked={preferences.soundEnabled}
                  onChange={(e) => updatePreference('soundEnabled', e.target.checked)}
                  className="toggle"
                />
              </label>
              
              <label className="flex items-center justify-between text-gray-300 mt-3">
                <span>Vibration</span>
                <input
                  type="checkbox"
                  checked={preferences.vibrationEnabled}
                  onChange={(e) => updatePreference('vibrationEnabled', e.target.checked)}
                  className="toggle"
                />
              </label>
            </div>
          </div>
        </div>
      )}
      
      {/* Notification History */}
      {notifications.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">Recent Notifications</h3>
            <button
              onClick={clearNotifications}
              className="text-gray-400 text-sm hover:text-white"
            >
              Clear All
            </button>
          </div>
          
          <div className="space-y-2 max-h-64 overflow-y-auto">
            <AnimatePresence>
              {notifications.map((notification) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`p-3 rounded-lg flex items-start gap-3 ${
                    notification.type === 'error' ? 'bg-red-900/20' :
                    notification.type === 'success' ? 'bg-green-900/20' :
                    notification.type === 'warning' ? 'bg-yellow-900/20' :
                    'bg-blue-900/20'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {notification.type === 'error' ? (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    ) : notification.type === 'success' ? (
                      <Check className="w-5 h-5 text-green-400" />
                    ) : (
                      <Info className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <h4 className="text-white font-medium text-sm">
                      {notification.title}
                    </h4>
                    <p className="text-gray-400 text-xs mt-1">
                      {notification.body}
                    </p>
                    <p className="text-gray-500 text-xs mt-2">
                      {new Date(notification.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  
                  <button
                    onClick={() => removeNotification(notification.id)}
                    className="flex-shrink-0 text-gray-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
}

export default MobilePushNotifications;