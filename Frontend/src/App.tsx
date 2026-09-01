import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Onboarding      from './pages/Onboarding/Onboarding'
import Register        from './pages/Register/Register'
import Login           from './pages/Login/Login'
import FarmerDashboard from './pages/FarmerDashboard/Farmerdashboard'
import BuyerDashboard  from './pages/BuyerSellerDashboard/BuyerDashboard'
import SellerDashboard from './pages/SellerDashboard/SellerDashboard'
import FloatingAI      from './components/FloatingAI/FloatingAI'
import { ToastContainer }   from './components/Toast/Toast'
import { ToastProvider }    from './context/ToastContext'
import { PWAInstallBanner } from './components/PWAInstallBanner/PWAInstallBanner'
import { authService }      from './services/authService'
import { BASE_URL }         from './services/apiConfig'

// ── KEEP RENDER BACKEND ALIVE ──────────────────────────────────────
// This component pings the backend every 12 minutes to prevent Render cold starts
function KeepAlive() {
  useEffect(() => {
    // Only run in production
    if (import.meta.env.PROD) {
      // `.replace('/api', ...)` swapped the first match anywhere in the string,
      // so a host containing "/api" would have produced a broken health URL.
      const healthUrl = BASE_URL.replace(/\/api\/?$/, '') + '/health';

      // Initial ping after 10 seconds
      const initialPing = setTimeout(async () => {
        try {
          const response = await fetch(healthUrl);
          if (response.ok) {
            console.log('🏓 Initial keep-alive ping sent successfully');
          }
        } catch (err) {
          console.error('❌ Initial keep-alive ping failed:', err);
        }
      }, 10000);

      // Ping every 12 minutes
      const interval = setInterval(async () => {
        try {
          const response = await fetch(healthUrl);
          if (response.ok) {
            console.log(`🏓 Keep-alive ping sent at ${new Date().toISOString()}`);
          }
        } catch (err) {
          console.error('❌ Keep-alive ping failed:', err);
        }
      }, 12 * 60 * 1000); // 12 minutes

      return () => {
        clearTimeout(initialPing);
        clearInterval(interval);
      };
    }
  }, []);

  return null; // This component renders NOTHING
}

function FarmerWithAI() {
  return (
    <>
      <FarmerDashboard />
      <FloatingAI />
    </>
  )
}

// Auto-redirect based on saved session
function AutoRedirect() {
  // Refresh session timestamp every time app opens
  useEffect(() => { authService.refreshSession() }, [])

  if (authService.isSessionValid()) {
    const user = authService.getUser()
    if (user?.role === 'farmer') return <Navigate to="/farmer/dashboard" replace />
    if (user?.role === 'buyer')  return <Navigate to="/buyer/dashboard"  replace />
    if (user?.role === 'seller') return <Navigate to="/seller/dashboard" replace />
  }

  return <Onboarding />
}

// Guard: redirect to dashboard if already logged in
function GuestOnly({ children }: { children: React.ReactNode }) {
  if (authService.isSessionValid()) {
    const user = authService.getUser()
    if (user?.role === 'farmer') return <Navigate to="/farmer/dashboard" replace />
    if (user?.role === 'buyer')  return <Navigate to="/buyer/dashboard"  replace />
    if (user?.role === 'seller') return <Navigate to="/seller/dashboard" replace />
  }
  return <>{children}</>
}

// Guard: redirect to login if not logged in
function Protected({ children }: { children: React.ReactNode }) {
  if (!authService.isSessionValid()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export default function App() {
  // ── LISTEN FOR PUSH NOTIFICATIONS FROM SERVICE WORKER ──────────────
  useEffect(() => {
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_NOTIFICATION') {
        try {
          const stored = localStorage.getItem('agf_push_notifs');
          const existing: any[] = stored ? JSON.parse(stored) : [];
          
          // Add new notification to the beginning (newest first)
          existing.unshift(event.data.payload);
          
          // Keep max 50 notifications
          if (existing.length > 50) {
            existing.splice(50);
          }
          
          localStorage.setItem('agf_push_notifs', JSON.stringify(existing));
          console.log('📬 Push notification stored in localStorage:', event.data.payload.title);
        } catch (error) {
          console.error('Failed to store push notification:', error);
        }
      }
    };

    // Check if service worker is available
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker?.addEventListener('message', handleSWMessage);
      console.log('📬 Service Worker message listener registered');
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
        console.log('📬 Service Worker message listener removed');
      }
    };
  }, []);

  return (
    <ToastProvider>
      <KeepAlive /> {/* ← Completely invisible - renders nothing */}
      <PWAInstallBanner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AutoRedirect />} />

          <Route path="/register" element={
            <GuestOnly><Register /></GuestOnly>
          } />

          <Route path="/login" element={
            <GuestOnly><Login /></GuestOnly>
          } />

          <Route path="/farmer/*" element={
            <Protected><FarmerWithAI /></Protected>
          } />

          <Route path="/buyer/*" element={
            <Protected><BuyerDashboard /></Protected>
          } />

          <Route path="/seller/*" element={
            <Protected><SellerDashboard /></Protected>
          } />

          <Route path="/admin/*" element={
            <div style={{ padding: 40 }}>Admin — coming next</div>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer />
      </BrowserRouter>
    </ToastProvider>
  )
}