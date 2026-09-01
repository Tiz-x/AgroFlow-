import { RiLeafFill, RiCloseLine, RiDownloadLine } from 'react-icons/ri'
import { usePWAInstall } from '../../hooks/usePWAInstall'
import { useState } from 'react'

export function PWAInstallBanner() {
  const { canInstall, isInstalled, isIOS, install } = usePWAInstall()
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('pwa_banner_dismissed') === '1'
  )

  if (isInstalled || dismissed) return null
  if (!canInstall && !isIOS) return null

  const dismiss = () => {
    setDismissed(true)
    localStorage.setItem('pwa_banner_dismissed', '1')
  }

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: 16, right: 16,
      background: '#0f1f11', borderRadius: 16,
      padding: '14px 16px', zIndex: 9998,
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      border: '1px solid rgba(168,216,50,0.3)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: '#a8d832', display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <RiLeafFill size={22} color="#0f1f11" />
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
          Install AgroFlow+
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
          {isIOS
            ? 'Tap Share → Add to Home Screen'
            : 'Get the app for a better experience'
          }
        </div>
      </div>

      {!isIOS && (
        <button
          onClick={install}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 14px', borderRadius: 100,
            background: '#a8d832', color: '#0f1f11',
            border: 'none', fontWeight: 700, fontSize: 12,
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <RiDownloadLine size={14} /> Install
        </button>
      )}

      <button
        onClick={dismiss}
        style={{
          background: 'transparent', border: 'none',
          color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
          padding: 4, flexShrink: 0,
        }}
      >
        <RiCloseLine size={18} />
      </button>
    </div>
  )
}