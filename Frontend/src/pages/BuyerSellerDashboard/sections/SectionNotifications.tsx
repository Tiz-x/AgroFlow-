import { useState, useEffect } from "react";
import { RiNotificationLine, RiCheckDoubleLine, RiBellLine } from "react-icons/ri";
import { GiTruck } from "react-icons/gi";
import { timeAgo } from "../constants";
import { marketService } from "../../../services/marketService";
import styles from "../BuyerSellerDashboard.module.css";
import type { Notification } from "../../../services/marketService";

interface PushNotif {
  id:        string
  title:     string
  body:      string
  timestamp: number
  read:      boolean
}

interface SectionNotificationsProps {
  notifs:    Notification[];
  onMarkAll: () => void;
}

export function SectionNotifications({ notifs, onMarkAll }: SectionNotificationsProps) {
  const [pushNotifs, setPushNotifs] = useState<PushNotif[]>([])

  useEffect(() => {
    // Load stored push notifications from localStorage
    try {
      const stored = localStorage.getItem('agf_push_notifs')
      if (stored) setPushNotifs(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const markPushRead = (id: string) => {
    setPushNotifs(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, read: true } : n)
      localStorage.setItem('agf_push_notifs', JSON.stringify(updated))
      return updated
    })
  }

  const clearPushNotifs = () => {
    setPushNotifs([])
    localStorage.removeItem('agf_push_notifs')
  }

  const allEmpty = notifs.length === 0 && pushNotifs.length === 0

  if (allEmpty) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}><RiNotificationLine size={48} /></div>
        <div className={styles.emptyTitle}>No notifications yet</div>
        <div className={styles.emptyText}>
          When you get matched or receive updates, they will appear here.
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#9ead9f', fontWeight: 600 }}>
          {notifs.length + pushNotifs.filter(n => !n.read).length} unread
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {pushNotifs.length > 0 && (
            <button onClick={clearPushNotifs} style={{ fontSize: 12, fontWeight: 700, color: '#e05252', background: 'none', border: 'none', cursor: 'pointer' }}>
              Clear all
            </button>
          )}
          <button onClick={onMarkAll} style={{ fontSize: 12, fontWeight: 700, color: '#2d6a35', background: 'none', border: 'none', cursor: 'pointer' }}>
            Mark all as read
          </button>
        </div>
      </div>

      <div className={styles.notifList}>
        {/* Push notifications first */}
        {pushNotifs.map(n => (
          <div
            key={n.id}
            className={`${styles.notifCard} ${!n.read ? styles.notifUnread : ''}`}
            onClick={() => markPushRead(n.id)}
          >
            <div className={`${styles.notifIconWrap} ${styles.notiflime}`}>
              <RiBellLine size={16} />
            </div>
            <div className={styles.notifbody}>
              <div className={styles.notifTitle}>{n.title}</div>
              <div className={styles.notifText}>{n.body}</div>
            </div>
            <div className={styles.notifRight}>
              <div className={styles.notifTime}>{timeAgo(new Date(n.timestamp).toISOString())}</div>
              {!n.read && <div className={styles.unreadDot} />}
            </div>
          </div>
        ))}

        {/* App notifications */}
        {notifs.map(n => (
          <div
            key={n.id}
            className={`${styles.notifCard} ${!n.read ? styles.notifUnread : ''}`}
            onClick={() => marketService.markNotifRead(n.id)}
          >
            <div className={`${styles.notifIconWrap} ${n.type === 'match' ? styles.notiflime : styles.notifamber}`}>
              {n.type === 'match' ? <RiCheckDoubleLine size={16} /> : <GiTruck size={16} />}
            </div>
            <div className={styles.notifbody}>
              <div className={styles.notifTitle}>{n.title}</div>
              <div className={styles.notifText}>{n.message}</div>
            </div>
            <div className={styles.notifRight}>
              <div className={styles.notifTime}>{timeAgo(n.createdAt)}</div>
              {!n.read && <div className={styles.unreadDot} />}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}