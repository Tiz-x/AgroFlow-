// ── Shared API configuration ──────────────────────────────────────────
// authService used `?? 'http://localhost:5000/api'` while marketService used
// `|| 'https://…onrender.com/api'`. Because Frontend/.env defines an *empty*
// VITE_API_URL, `??` kept the empty string — so auth calls went to relative
// URLs while market calls went to production. Resolving it in one place with
// an empty-string check keeps the whole app pointed at the same backend.

const RAW_API_URL = import.meta.env.VITE_API_URL

export const BASE_URL =
  typeof RAW_API_URL === 'string' && RAW_API_URL.trim() !== ''
    ? RAW_API_URL.trim().replace(/\/$/, '')
    : 'https://ai-farmer-platform-backend-code.onrender.com/api'

export const TOKEN_KEY = 'agf_token'
export const USER_KEY = 'agf_user'
export const SESSION_TIME_KEY = 'agf_session_time'

export function getStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

/**
 * Called when the API rejects our token. Requests used to swallow 401s and
 * return empty arrays, so an expired session looked like "you have no orders"
 * instead of prompting a fresh sign-in.
 */
export function handleUnauthorized() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(SESSION_TIME_KEY)

  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.replace('/login?expired=1')
  }
}
