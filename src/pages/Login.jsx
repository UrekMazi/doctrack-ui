import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { beginFlow, markFlow, endFlow } from '../utils/perfTrace'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Inject animation keyframes on mount
  useEffect(() => {
    const styleId = 'live-bg-styles'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.innerHTML = `
        @keyframes panBg {
          0% { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }
      `
      document.head.appendChild(style)
    }
  }, [])

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
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: '#002868',
      backgroundImage: 'url(/branding/bg_gradient.jpg)',
      backgroundSize: '150% 150%', // Zoomed in slightly to allow panning
      backgroundRepeat: 'no-repeat',
      animation: 'panBg 30s ease-in-out infinite alternate',
      fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
    }}>

      {/* Glassmorphism Login Card */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: 24,
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
        padding: '44px 40px',
        width: 380,
        maxWidth: '90vw',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img
            src="/branding/PPA_small.jpg"
            alt="PPA Logo"
            style={{ width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', border: '3px solid #002868', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
          <h2 style={{ margin: '16px 0 4px', fontSize: 22, fontWeight: 800, color: '#002868', letterSpacing: '-0.5px' }}>
            DocTrack EDMS
          </h2>
          <p style={{ fontSize: 12, color: '#6c757d', margin: 0, fontWeight: 500 }}>
            Philippine Ports Authority — PMO Negros Occ/BBB
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fde8e8', border: '1px solid #f5c6cb', color: '#842029',
            borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16, textAlign: 'center',
            fontWeight: 500
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#495057', display: 'block', marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoFocus
              style={{
                width: '100%', padding: '12px 14px', border: '1.5px solid #dee2e6', borderRadius: 12,
                fontSize: 14, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s, box-shadow 0.2s',
                backgroundColor: 'rgba(255,255,255,0.8)'
              }}
              onFocus={e => { e.target.style.borderColor = '#002868'; e.target.style.boxShadow = '0 0 0 3px rgba(0, 40, 104, 0.1)'; e.target.style.backgroundColor = '#fff' }}
              onBlur={e => { e.target.style.borderColor = '#dee2e6'; e.target.style.boxShadow = 'none'; e.target.style.backgroundColor = 'rgba(255,255,255,0.8)' }}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#495057', display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              style={{
                width: '100%', padding: '12px 14px', border: '1.5px solid #dee2e6', borderRadius: 12,
                fontSize: 14, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s, box-shadow 0.2s',
                backgroundColor: 'rgba(255,255,255,0.8)'
              }}
              onFocus={e => { e.target.style.borderColor = '#002868'; e.target.style.boxShadow = '0 0 0 3px rgba(0, 40, 104, 0.1)'; e.target.style.backgroundColor = '#fff' }}
              onBlur={e => { e.target.style.borderColor = '#dee2e6'; e.target.style.boxShadow = 'none'; e.target.style.backgroundColor = 'rgba(255,255,255,0.8)' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px', background: 'linear-gradient(135deg, #002868 0%, #001a4d 100%)', color: '#fff',
              border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.8 : 1,
              transition: 'transform 0.15s, box-shadow 0.15s',
              boxShadow: '0 8px 16px rgba(0, 40, 104, 0.25)',
            }}
            onMouseEnter={e => { if (!loading) e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 12px 20px rgba(0, 40, 104, 0.35)' }}
            onMouseLeave={e => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = '0 8px 16px rgba(0, 40, 104, 0.25)' }}
            onMouseDown={e => { if (!loading) e.target.style.transform = 'translateY(1px)' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#adb5bd', fontWeight: 500 }}>
          DocTrack EDMS v2.0 — Records Process Flow Improvement
        </div>
      </div>
    </div>
  )
}

