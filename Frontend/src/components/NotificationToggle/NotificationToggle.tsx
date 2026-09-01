import { useEffect } from 'react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { RiBellLine, RiNotificationOffLine } from 'react-icons/ri';

export function NotificationToggle() {
  const { isSubscribed, isSupported, isLoading, subscribe, unsubscribe } = usePushNotifications();

  useEffect(() => {
    console.log('🔔 NotificationToggle - isSubscribed:', isSubscribed);
    console.log('🔔 NotificationToggle - isSupported:', isSupported);
    console.log('🔔 NotificationToggle - isLoading:', isLoading);
  }, [isSubscribed, isSupported, isLoading]);

  // ── Development mode message ──────────────────────
  const isDev = import.meta.env.DEV;

  if (isDev) {
    return (
      <div style={{ 
        padding: '12px 16px', 
        background: '#f7f8f5', 
        borderRadius: 10, 
        fontSize: 13, 
        color: '#6b7f6e' 
      }}>
        🔔 Push notifications work on the live site only. 
        Deploy to <strong>agroflowplus-platform.vercel.app</strong> to test.
      </div>
    );
  }

  if (!isSupported) {
    return (
      <div style={{ fontSize: 13, color: '#9ead9f', padding: '8px 0' }}>
        Push notifications not supported on this device.
      </div>
    );
  }

  const handleToggle = () => {
    console.log('🔔 Toggle clicked - isSubscribed:', isSubscribed);
    if (isLoading) return;
    
    if (isSubscribed) {
      unsubscribe();
    } else {
      subscribe();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toggle row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: isSubscribed ? '#f2f9e4' : '#f7f8f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {isSubscribed
              ? <RiBellLine size={18} color="#2d6a35" />
              : <RiNotificationOffLine size={18} color="#9ead9f" />
            }
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#141f15' }}>
              Push Notifications
            </div>
            <div style={{ fontSize: 12, color: '#9ead9f', marginTop: 2 }}>
              {isSubscribed
                ? 'You will receive real-time updates'
                : 'Enable to get notified about orders and listings'
              }
            </div>
          </div>
        </div>

        {/* Toggle switch */}
        <label style={{
          position: 'relative',
          display: 'inline-block',
          width: 48,
          height: 26,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}>
          <input
            type="checkbox"
            checked={isSubscribed}
            onChange={handleToggle}
            disabled={isLoading}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span style={{
            position: 'absolute',
            inset: 0,
            background: isSubscribed ? '#a8d832' : '#e2e8df',
            borderRadius: 34,
            transition: 'background 0.3s',
            opacity: isLoading ? 0.6 : 1,
          }}>
            <span style={{
              position: 'absolute',
              height: 20,
              width: 20,
              left: isSubscribed ? 24 : 3,
              bottom: 3,
              background: 'white',
              borderRadius: '50%',
              transition: 'left 0.3s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </span>
        </label>
      </div>

      {/* Test button — only when subscribed */}
      {/* {isSubscribed && (
        <button
          onClick={sendTestNotification}
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            background: '#f2f9e4',
            border: '1.5px solid #a8d832',
            color: '#2d6a35',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            alignSelf: 'flex-start',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#a8d832';
            e.currentTarget.style.color = '#141f15';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#f2f9e4';
            e.currentTarget.style.color = '#2d6a35';
          }}
        >
          Send Test Notification
        </button>
      )} */}
    </div>
  );
}