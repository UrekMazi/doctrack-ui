import { createContext, useContext, useState, useEffect } from 'react'
import { markFlow } from '../utils/perfTrace'

const AuthContext = createContext(null)

const API_BASE = '/api'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('doctrack_token') || '')
  const [loading, setLoading] = useState(true)

  // On mount, verify token
  useEffect(() => {
    if (!token) { setLoading(false); return }
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setUser(data.user); setLoading(false) })
      .catch(() => { setToken(''); localStorage.removeItem('doctrack_token'); setLoading(false) })
  }, [token])

  const login = async (username, password) => {
    let res
    markFlow('auth:request:start', { username })
    try {
      res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
    } catch {
      markFlow('auth:request:network-error')
      throw new Error('Cannot reach backend server. Check if backend is running on port 3001.')
    }

    markFlow('auth:response:received', { status: res.status })

    const responseText = await res.text()
    let data = null
    try {
      data = responseText ? JSON.parse(responseText) : {}
    } catch {
      data = null
    }

    markFlow('auth:response:parsed', { hasBody: !!responseText })

    if (!res.ok) {
      const fallbackMessage = `Login failed (HTTP ${res.status})`
      const message = data?.error || fallbackMessage
      markFlow('auth:response:error', { status: res.status, message })
      throw new Error(message)
    }

    if (!data?.token || !data?.user) {
      markFlow('auth:response:invalid-shape')
      throw new Error('Invalid response from backend during login.')
    }

    markFlow('auth:state:update:start', { role: data.user?.role })
    localStorage.setItem('doctrack_token', data.token)
    setToken(data.token)
    setUser(data.user)
    markFlow('auth:state:update:done')
    return data.user
  }

  const logout = () => {
    localStorage.removeItem('doctrack_token')
    setToken('')
    setUser(null)
  }

  const authFetch = async (url, options = {}) => {
    const headers = { ...options.headers, Authorization: `Bearer ${token}` }
    if (options.body && typeof options.body === 'string') {
      headers['Content-Type'] = 'application/json'
    }
    const res = await fetch(url, { ...options, headers })
    if (res.status === 401) { logout(); throw new Error('Session expired') }
    return res
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
