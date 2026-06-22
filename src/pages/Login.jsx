import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { beginFlow, markFlow, endFlow } from '../utils/perfTrace'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const usernameStorageKey = 'irris.login.username'

  useEffect(() => {
    const savedUsername = window.localStorage.getItem(usernameStorageKey)
    if (savedUsername) {
      setUsername(savedUsername)
      setRememberMe(true)
    }
  }, [])

  useEffect(() => {
    if (rememberMe && username.trim()) {
      window.localStorage.setItem(usernameStorageKey, username.trim())
      return
    }
    window.localStorage.removeItem(usernameStorageKey)
  }, [rememberMe, username])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    beginFlow('login-boot', { username })
    markFlow('login:submit')
    try {
      await login(username, password)
      markFlow('login:resolved')
    } catch (err) {
      markFlow('login:error', { message: err?.message || 'unknown' })
      endFlow('failed', { message: err?.message || 'unknown' })
      setError(err?.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-body">
          <header className="login-brand">
            <div className="login-logo">
              <img
                src="/branding/PMO%20Logo%20v2.jpg"
                alt="PMO Logo"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            </div>
          </header>

          <div className="login-panel">
            <div
              className="login-identity"
              aria-label="IRRIS - Incoming Records Routing and Indorsement System"
            >
              <span className="login-word" aria-hidden="true">
                <span className="login-word-letter">I</span>
                <span className="login-word-rest">ncoming</span>
              </span>
              <span className="login-word" aria-hidden="true">
                <span className="login-word-letter">R</span>
                <span className="login-word-rest">ecords</span>
              </span>
              <span className="login-word login-word-routing" aria-hidden="true">
                <span className="login-word-letter">R</span>
                <span className="login-word-rest">outing and</span>
              </span>
              <span className="login-word" aria-hidden="true">
                <span className="login-word-letter">I</span>
                <span className="login-word-rest">ndorsement</span>
              </span>
              <span className="login-word" aria-hidden="true">
                <span className="login-word-letter">S</span>
                <span className="login-word-rest">ystem</span>
              </span>
            </div>

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="login-field">
                <label className="login-label" htmlFor="login-username">
                  Username
                </label>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  autoComplete="username"
                  autoFocus
                  className="login-input"
                />
              </div>

              <div className="login-field">
                <label className="login-label" htmlFor="login-password">
                  Password
                </label>
                <div className="login-input-wrap">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className="login-input login-input--with-button"
                  />
                  <button
                    type="button"
                    className="login-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    aria-controls="login-password"
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M4.2 4.2a1 1 0 0 1 1.4 0l14.2 14.2a1 1 0 1 1-1.4 1.4l-2.3-2.3A10.3 10.3 0 0 1 12 19.5C6.4 19.5 2.1 15.5 1 12c.5-1.6 1.6-3.4 3.4-5l-1.6-1.6a1 1 0 0 1 0-1.4zm6.1 6.1 3.4 3.4a2.6 2.6 0 0 0-3.4-3.4zM12 4.5c5.6 0 9.9 4 11 7.5-.6 1.8-1.9 3.7-3.9 5.3l-3-3a4.6 4.6 0 0 0-6.4-6.4L7.2 6.5A10.4 10.4 0 0 1 12 4.5z"
                          fill="currentColor"
                        />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 4.5c5.6 0 9.9 4 11 7.5-1.1 3.5-5.4 7.5-11 7.5S2.1 15.5 1 12c1.1-3.5 5.4-7.5 11-7.5zm0 2c-3.7 0-7 2.4-8.3 5.5 1.3 3.1 4.6 5.5 8.3 5.5s7-2.4 8.3-5.5c-1.3-3.1-4.6-5.5-8.3-5.5zm0 2.2a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6z"
                          fill="currentColor"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="login-meta">
                <label className="login-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Remember me</span>
                </label>
              </div>

              <button className="login-button" type="submit" disabled={loading} aria-busy={loading}>
                {loading && <span className="login-button-spinner" aria-hidden="true" />}
                <span>{loading ? 'Signing in...' : 'Sign In'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

