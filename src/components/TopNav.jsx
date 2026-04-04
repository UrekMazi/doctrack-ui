import { useNavigate } from 'react-router-dom'
import { Dropdown } from 'react-bootstrap'
import { useState } from 'react'

export default function TopNav({ currentUser, onLogout }) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/tracking?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('')
    }
  }

  const initials = currentUser?.name
    ? currentUser.name.split(' ').map(n => n[0]).join('')
    : 'U'

  return (
    <header className="topnav">
      <form className="topnav-search" onSubmit={handleSearch}>
        <i className="bi bi-search"></i>
        <input
          type="text"
          placeholder="Search by control/reference number, subject, or sender..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </form>

      <div className="topnav-actions">
        <button className="topnav-btn" title="Notifications">
          <i className="bi bi-bell"></i>
          <span className="topnav-notif-dot"></span>
        </button>
        <button className="topnav-btn" title="Settings">
          <i className="bi bi-gear"></i>
        </button>

        <Dropdown align="end">
          <Dropdown.Toggle as="div" className="topnav-user" style={{ cursor: 'pointer' }}>
            <div className="topnav-avatar">{initials}</div>
            <div className="d-none d-md-block">
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{currentUser?.name}</div>
              <div style={{ fontSize: 13, color: '#6c757d' }}>{currentUser?.role}</div>
            </div>
            <i className="bi bi-chevron-down" style={{ fontSize: 10, color: '#6c757d', marginLeft: 4 }}></i>
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Item disabled>
              <small className="text-muted">{currentUser?.division}</small>
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item onClick={onLogout}>
              <i className="bi bi-box-arrow-left me-2"></i>Sign Out
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
    </header>
  )
}
