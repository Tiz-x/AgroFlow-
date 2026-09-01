import { useState, useEffect, useRef } from 'react'
import { RiRobot2Fill } from 'react-icons/ri'
import { MdClose } from 'react-icons/md'
import { useNavigate, useLocation } from 'react-router-dom'
import styles from './FloatingAI.module.css'

interface Props {
  navbarMode?: boolean
}

export default function FloatingAI({ navbarMode = false }: Props) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const btnRef    = useRef<HTMLButtonElement>(null)

  const [showTooltip, setShowTooltip] = useState(false)
  const [hasOpened,   setHasOpened]   = useState(false)
  const [pos, setPos] = useState({ x: window.innerWidth - 72, y: window.innerHeight - 160 })
  const [dragging, setDragging] = useState(false)

  const dragStart  = useRef({ x: 0, y: 0 })
  const posRef     = useRef(pos)
  const isDragging = useRef(false)
  const moved      = useRef(false)
  const pointerDownAt = useRef({ x: 0, y: 0 })

  const MOVE_THRESHOLD = 8 // px — real drags move way more than this; taps barely move at all

  const isOnFarmerDashboard = location.pathname.startsWith('/farmer')

  useEffect(() => {
    const seen = localStorage.getItem('agf_ai_tooltip_seen')
    if (!seen) {
      const timer = setTimeout(() => setShowTooltip(true), 3000)
      return () => clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (showTooltip) {
      const timer = setTimeout(() => setShowTooltip(false), 6000)
      return () => clearTimeout(timer)
    }
  }, [showTooltip])

  // Snap to nearest edge
  const snapToEdge = (x: number, y: number) => {
    const W   = window.innerWidth
    const H   = window.innerHeight
    const BTN = 56

    const distLeft   = x
    const distRight  = W - x - BTN
    const distTop    = y
    const distBottom = H - y - BTN

    const min = Math.min(distLeft, distRight, distTop, distBottom)

    let nx = x, ny = y

    if (min === distLeft)   { nx = 12 }
    if (min === distRight)  { nx = W - BTN - 12 }
    if (min === distTop)    { ny = 12 }
    if (min === distBottom) { ny = H - BTN - 80 } // above bottom nav

    // Clamp
    nx = Math.max(12, Math.min(W - BTN - 12, nx))
    ny = Math.max(12, Math.min(H - BTN - 80, ny))

    return { x: nx, y: ny }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (navbarMode) return
    isDragging.current = true
    moved.current      = false
    dragStart.current  = {
      x: e.clientX - posRef.current.x,
      y: e.clientY - posRef.current.y,
    }
    pointerDownAt.current = { x: e.clientX, y: e.clientY } // track raw start point
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return

    // Only count as "moved" once we cross the threshold — filters out tap jitter
    const dx = Math.abs(e.clientX - pointerDownAt.current.x)
    const dy = Math.abs(e.clientY - pointerDownAt.current.y)
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      moved.current = true
    }

    const nx = e.clientX - dragStart.current.x
    const ny = e.clientY - dragStart.current.y
    const clamped = {
      x: Math.max(0, Math.min(window.innerWidth  - 56, nx)),
      y: Math.max(0, Math.min(window.innerHeight - 56, ny)),
    }
    posRef.current = clamped
    setPos(clamped)
  }

  const onPointerUp = () => {
    if (!isDragging.current) return
    isDragging.current = false
    setDragging(false)

    if (moved.current) {
      // real drag — snap to edge
      const snapped = snapToEdge(posRef.current.x, posRef.current.y)
      posRef.current = snapped
      setPos(snapped)
    } else {
      // was a tap — open directly here instead of waiting on onClick
      handleClick()
    }
  }

  function handleClick() {
    setShowTooltip(false)
    setHasOpened(true)
    localStorage.setItem('agf_ai_tooltip_seen', 'true')
    navigate('/farmer/dashboard')
  }

  if (isOnFarmerDashboard) return null

  /* ── NAVBAR PILL (desktop) ── */
  if (navbarMode) {
    return (
      <div className={styles.navPillWrap}>
        {showTooltip && (
          <div className={styles.navTooltip}>
            <p>👋 Need assistance?</p>
            <p>I'm Agro, your personal farming buddy!</p>
            <button className={styles.navTooltipClose} onClick={() => setShowTooltip(false)}>
              <MdClose size={12} />
            </button>
          </div>
        )}
        <button
          className={`${styles.navPill} ${showTooltip ? styles.navPillActive : ''}`}
          onClick={handleClick}
          aria-label="Open Agro AI assistant"
        >
          {!hasOpened && <span className={styles.navPillPulse} />}
          <span className={styles.navPillIcon}><RiRobot2Fill size={16} /></span>
          <span className={styles.navPillText}>Ask Agro AI</span>
        </button>
      </div>
    )
  }

  /* ── DRAGGABLE FLOATING BUTTON (mobile) ── */
  return (
    <>
      {showTooltip && !dragging && (
        <div
          className={styles.tooltip}
          style={{
            position: 'fixed',
            left: pos.x > window.innerWidth / 2
              ? pos.x - 160
              : pos.x + 64,
            top:  pos.y - 70,
            zIndex: 9998,
          }}
        >
          <p>👋 Need assistance?</p>
          <p>I'm Agro, your farming buddy!</p>
          <button className={styles.tooltipClose} onClick={() => setShowTooltip(false)}>
            <MdClose size={12} />
          </button>
        </div>
      )}

      <button
        ref={btnRef}
        className={`${styles.floatBtn} ${dragging ? styles.floatBtnDragging : ''}`}
        style={{
          position:  'fixed',
          left:      pos.x,
          top:       pos.y,
          touchAction: 'none',
          cursor:    dragging ? 'grabbing' : 'grab',
          transition: dragging ? 'none' : 'left 0.3s cubic-bezier(0.34,1.28,0.64,1), top 0.3s cubic-bezier(0.34,1.28,0.64,1)',
          zIndex: 9999,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="Open AI assistant"
      >
        <RiRobot2Fill size={24} />
        {!hasOpened && <span className={styles.floatPulse} />}
      </button>
    </>
  )
}