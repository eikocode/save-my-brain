// Token storage helpers
export const getAccessToken = () => localStorage.getItem('smb_access_token')
export const getRefreshToken = () => localStorage.getItem('smb_refresh_token')
export const getUser = () => {
  const u = localStorage.getItem('smb_user')
  return u ? JSON.parse(u) : null
}

export const saveAuth = (accessToken, refreshToken, user) => {
  localStorage.setItem('smb_access_token', accessToken)
  localStorage.setItem('smb_refresh_token', refreshToken)
  localStorage.setItem('smb_user', JSON.stringify(user))
}

export const clearAuth = () => {
  localStorage.removeItem('smb_access_token')
  localStorage.removeItem('smb_refresh_token')
  localStorage.removeItem('smb_user')
}

// DEV BYPASS — remove before going live
export const isLoggedIn = () => true
export const getToken = getAccessToken  // alias used by Phase 8 components

// API base URL — in production, points to DigitalOcean droplet
const API_BASE = import.meta.env.VITE_API_URL || ''

// API fetch wrapper — adds Bearer token automatically
export const apiFetch = async (path, options = {}) => {
  const token = getAccessToken()
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  })
  if (res.status === 401) {
    clearAuth()
    window.location.href = '/login'
    return
  }
  return res
}
