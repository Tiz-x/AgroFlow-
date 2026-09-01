import { useState, useEffect } from 'react'
import { authService } from '../services/authService'
import { BASE_URL } from '../services/apiConfig'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Read the capability directly instead of through React state. `subscribe`
// is called from inside the mount effect, where it closes over the *initial*
// `isSupported` value (false) — so the auto-subscribe path always bailed out
// with "not supported" even on browsers that support push perfectly well.
function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i)
  }
  return view
}

export function usePushNotifications() {
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null)

  useEffect(() => {
    // Logging `import.meta.env` dumped every VITE_* value — including the
    // API URL and VAPID key — into the browser console of every visitor.
    const supported = pushSupported()
    setIsSupported(supported)

    let mounted = true

    if (supported) {
      checkSubscription().then(async (alreadySubscribed) => {
        if (!mounted) return

        // Auto-subscribe if running as installed PWA and not already subscribed
        const isPWA = window.matchMedia('(display-mode: standalone)').matches

        if (isPWA && !alreadySubscribed) {
          // Small delay to let the user see the permission prompt
          setTimeout(() => {
            if (mounted) {
              subscribe()
            }
          }, 1000)
        }
      }).catch(error => {
        console.error('Error checking push subscription:', error)
      })
    }

    // Listen for display-mode changes (user installs PWA while app is running)
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handleDisplayChange = () => {
      if (mediaQuery.matches) {
        checkSubscription()
          .then((alreadySubscribed) => {
            if (!alreadySubscribed) subscribe()
          })
          // An unhandled rejection here surfaced as a console error with no
          // context and left the UI thinking it was still subscribing.
          .catch(error => {
            console.error('Auto-subscribe after PWA install failed:', error)
          })
      }
    }

    mediaQuery.addEventListener('change', handleDisplayChange)

    return () => {
      mounted = false
      mediaQuery.removeEventListener('change', handleDisplayChange)
    }
  }, [])

  const checkSubscription = async (): Promise<boolean> => {
    try {
      // Wait for service worker to be ready
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      const hasSubscription = !!sub
      setIsSubscribed(hasSubscription)
      setSubscriptionError(null)
      return hasSubscription
    } catch (error) {
      console.error('Check push subscription failed:', error)
      setIsSubscribed(false)
      setSubscriptionError('Failed to check subscription status')
      return false
    }
  }

  const subscribe = async (): Promise<boolean> => {
    // Capability is read live, not from state — see pushSupported().
    if (!pushSupported()) {
      setSubscriptionError('Push notifications not supported in this browser')
      return false
    }

    if (!VAPID_PUBLIC_KEY) {
      console.warn('Push notifications not configured — VAPID public key missing')
      setSubscriptionError('Push notifications not configured (missing VAPID key)')
      return false
    }

    setIsLoading(true)
    setSubscriptionError(null)

    // Safety timeout — stop spinning after 10 seconds no matter what
    let timeoutId: number | undefined = setTimeout(() => {
      setIsLoading(false)
      setSubscriptionError('Subscription timed out — please try again')
    }, 10000)

    try {
      // Request permission
      const permission = await Notification.requestPermission()

      if (permission !== 'granted') {
        clearTimeout(timeoutId)
        setIsLoading(false)
        setSubscriptionError('Notification permission denied')
        return false
      }

      // Wait for service worker
      const reg = await navigator.serviceWorker.ready

      // Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      // Send to server
      const token = authService.getToken()
      if (!token) {
        clearTimeout(timeoutId)
        setIsLoading(false)
        setSubscriptionError('Not authenticated')
        return false
      }

      const response = await fetch(`${BASE_URL}/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(sub.toJSON()),
      })

      if (!response.ok) {
        // The raw response body was shown to the user, so a proxy error page
        // or stack trace could end up rendered in the UI. Log the detail and
        // show something a person can act on.
        const errorText = await response.text().catch(() => '')
        console.error('Push subscribe failed:', response.status, errorText)
        clearTimeout(timeoutId)
        setIsLoading(false)
        setSubscriptionError('Could not enable notifications. Please try again.')
        return false
      }

      clearTimeout(timeoutId)
      setIsSubscribed(true)
      setIsLoading(false)
      setSubscriptionError(null)
      return true
    } catch (err: any) {
      // `err.message` was rendered straight into the UI, so a browser-internal
      // message like "Registration failed - push service error" reached the
      // user verbatim. Log the detail, show plain language.
      console.error('Push subscribe failed:', err)
      clearTimeout(timeoutId)
      setIsLoading(false)
      setSubscriptionError(
        err?.name === 'NotAllowedError'
          ? 'Notification permission was blocked in your browser settings'
          : 'Could not enable notifications. Please try again.'
      )
      return false
    }
  }

  const unsubscribe = async () => {
    setIsLoading(true)
    setSubscriptionError(null)

    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()

      if (sub) {
        // Tell the server first. Unsubscribing locally before the server call
        // meant a failed request left an orphaned row that the backend kept
        // pushing to forever.
        const token = authService.getToken()
        if (token) {
          const response = await fetch(`${BASE_URL}/push/unsubscribe`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          })

          if (!response.ok) {
            console.error('Server failed to remove push subscription:', response.status)
          }
        }

        // Unsubscribe from push manager
        await sub.unsubscribe()
        setIsSubscribed(false)
      } else {
        setIsSubscribed(false)
      }
    } catch (error) {
      console.error('Push unsubscribe failed:', error)
      setSubscriptionError('Could not turn off notifications. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return {
    isSubscribed,
    isSupported,
    isLoading,
    subscriptionError,
    subscribe,
    unsubscribe,
    checkSubscription,
  }
}