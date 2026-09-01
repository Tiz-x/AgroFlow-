import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiLeafFill } from 'react-icons/ri'
import {
  BsArrowRight, BsEye, BsEyeSlash,
  BsEnvelope, BsLockFill, BsExclamationCircle,
} from 'react-icons/bs'
import { authService, getContentImages } from '../../services/authService'
import type { UserRole } from '../../types/auth'
import styles from '../../styles/auth.module.css'

// ── Identifier validation (email or phone) ───────────────
function isValidIdentifier(value: string): boolean {
  const isEmail = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(value)
  const isPhone = /^(\+234|0)[789]\d{9}$/.test(value.replace(/\s+/g, ''))
  return isEmail || isPhone
}

// ── User-friendly error messages ──────────────────────────
function getUserFriendlyError(error: unknown): string {
  // Network errors
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'Unable to connect. Please check your internet connection.'
  }
  
  // Network errors (alternative)
  if (error instanceof Error && error.message.includes('NetworkError')) {
    return 'Connection lost. Please check your network and try again.'
  }
  
  // All other errors
  return 'Something went wrong. Please try again.'
}

export default function Login() {
  const navigate = useNavigate()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]   = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [loading, setLoading]     = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [apiError, setApiError]   = useState('')
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const [sideImage, setSideImage] = useState(
    'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=900&q=90'
  )

  useEffect(() => {
    getContentImages().then(imgs => {
      if (imgs['signin_side']) setSideImage(imgs['signin_side'])
    })
  }, [])

  const validate = () => {
    const e: Record<string, string> = {}

    // Identifier (email or phone)
    if (!identifier.trim()) {
      e.identifier = 'Email or phone number is required'
    } else if (!isValidIdentifier(identifier.trim())) {
      e.identifier = 'Enter a valid email or Nigerian phone number (e.g. 08012345678)'
    }

    // Password
    if (!password) {
      e.password = 'Password is required'
    } else if (password.length < 6) {
      e.password = 'Password must be at least 6 characters'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError('')
    if (!validate()) return

    setLoading(true)

    try {
      const res = await authService.login({ identifier, password })
      authService.saveSession(res)

      const role: UserRole = res.user.role as UserRole

      // Show full-screen splash immediately — covers white gap
      setNavigating(true)

      // Small delay lets the splash render before navigate fires
      setTimeout(() => {
        if      (role === 'farmer') navigate('/farmer/dashboard', { replace: true })
        else if (role === 'buyer')  navigate('/buyer/dashboard', { replace: true })
        else if (role === 'seller') navigate('/seller/dashboard', { replace: true })
        else                        navigate('/admin/dashboard', { replace: true })
      }, 80)

    } catch (err: unknown) {
      setApiError(getUserFriendlyError(err))
      setLoading(false)
    }
  }

  const err = (k: string) =>
    errors[k] ? (
      <div className={styles.fieldErrMsg}>
        <BsExclamationCircle size={11} />
        {errors[k]}
      </div>
    ) : null

  return (
    <>
      {/* ── NAVIGATING SPLASH SCREEN ───────────────────────────────────────── */}
      {navigating && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: '#0f1f11',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          gap: 16,
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: '#A8D832',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <RiLeafFill size={36} color="#0f1f11" />
          </div>
          <div style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '-0.02em',
          }}>
            AgroFlow<span style={{ color: '#A8D832' }}>+</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#A8D832',
                animation: 'pulse 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
                opacity: 0.7,
              }} />
            ))}
          </div>
          <style>{`
            @keyframes pulse {
              0%, 100% { transform: scale(0.8); opacity: 0.4; }
              50% { transform: scale(1.2); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      <div className={styles.shell}>

        {/* ── LEFT — farm photo ── */}
        <div className={styles.left}>
          <div
            className={styles.leftBg}
            style={{ backgroundImage: `url('${sideImage}')` }}
          />
          <div className={styles.leftOverlay} />

          <div className={styles.leftLogo}>
            <div className={styles.leftLogoMark}>
              <RiLeafFill size={17} />
            </div>
            <span className={styles.leftLogoText}>
              AgroFlow<span>+</span>
            </span>
          </div>

          <div className={styles.leftCaption}>
            <div className={styles.leftCaptionTag}>
              <div className={styles.leftCaptionDot} />
              <span className={styles.leftCaptionTagText}>Welcome Back</span>
            </div>
            <div className={styles.leftCaptionTitle}>
              Your Farm.<br />
              <em>Your Dashboard.</em>
            </div>
            <div className={styles.leftCaptionSub}>
              Sign in to manage your produce, track deliveries, and stay connected
              with your supply chain.
            </div>
          </div>
        </div>

        {/* ── RIGHT — login form ── */}
        <div className={styles.right}>
          <div className={styles.rightTopBar}>
            <div className={styles.mobileLogo}>
              <div className={styles.mobileLogoMark}>
                <RiLeafFill size={15} />
              </div>
              <span className={styles.mobileLogoText}>
                AgroFlow<span>+</span>
              </span>
            </div>
            <div className={styles.topBarRight}>
              <span className={styles.topBarText}>Don't have an account?</span>
              <button
                className={styles.topBarBtn}
                onClick={() => navigate('/register')}
              >
                Sign Up
              </button>
            </div>
          </div>

          <div className={styles.formWrap}>
            <h1 className={styles.formTitle}>Welcome Back</h1>
            <p className={styles.formSubtitle}>
              Sign in to your AgroFlow+ account
            </p>

            {apiError && (
              <div className={styles.errorBanner}>
                <BsExclamationCircle size={15} color="#e05252" />
                <span className={styles.errorBannerText}>{apiError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className={styles.fields}>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Email or Phone Number</label>
                  <div className={styles.fieldInputWrap}>
                    <span className={styles.fieldInputIcon}>
                      <BsEnvelope size={14} />
                    </span>
                    <input
                      className={`${styles.fieldInput} ${errors['identifier'] ? styles.fieldError : ''}`}
                      type="text"
                      placeholder="08012345678 or you@example.com"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      autoComplete="username"
                    />
                  </div>
                  {err('identifier')}
                </div>

                <div className={styles.fieldGroup}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className={styles.fieldLabel}>Password</label>
                    <span
                      style={{ fontSize: 12, color: '#2d6a35', fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => {/* TODO: forgot password */}}
                    >
                      Forgot password?
                    </span>
                  </div>
                  <div className={styles.fieldInputWrap}>
                    <span className={styles.fieldInputIcon}>
                      <BsLockFill size={13} />
                    </span>
                    <input
                      className={`${styles.fieldInput} ${errors['password'] ? styles.fieldError : ''}`}
                      type={showPwd ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className={styles.fieldPasswordToggle}
                      onClick={() => setShowPwd(p => !p)}
                      tabIndex={-1}
                    >
                      {showPwd ? <BsEyeSlash size={15} /> : <BsEye size={15} />}
                    </button>
                  </div>
                  {err('password')}
                </div>

                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <div className={styles.spinner} /> Signing in...
                    </>
                  ) : (
                    <>
                      Sign In
                      <div className={styles.submitBtnCircle}>
                        <BsArrowRight size={13} />
                      </div>
                    </>
                  )}
                </button>

              </div>
            </form>

            <p className={styles.termsText}>
              By signing in you agree to our{' '}
              <span className={styles.termsLink}>Terms of Service</span> and{' '}
              <span className={styles.termsLink}>Privacy Policy</span>.
            </p>
          </div>
        </div>

      </div>
    </>
  )
}