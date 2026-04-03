import { NavLink } from 'react-router-dom'

export default function Sidebar({ currentUser }) {
  const role = currentUser?.systemRole || 'Operator'

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <img
            src="/branding/PPA_small.jpg"
            alt="PMO-Negros Occidental/Bacolod/Banago Records Process Flow"
            onError={(e) => {
              e.currentTarget.src = '/branding/Philippine-Ports-Authority-Logo.png'
            }}
          />
        </div>
        <div className="sidebar-brand-text">
          <h5>Philippine Ports Authority</h5>
          <small>PMO-Negros Occidental/Bacolod/Banago Records Process Flow</small>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section">Main</div>
        <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <i className="bi bi-grid-1x2-fill"></i>
          Dashboard
        </NavLink>

        {/* OPERATOR (Records Section) */}
        {role === 'Operator' && (
          <>
            <div className="sidebar-section" style={{ marginTop: 16 }}>Operator</div>
            <NavLink to="/scan" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-upc-scan"></i>
              Scan & Register
            </NavLink>
            <NavLink to="/incoming" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-inbox-fill"></i>
              Incoming Communications
            </NavLink>
            <NavLink to="/outgoing" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-send-fill"></i>
              Outgoing
            </NavLink>
            <NavLink to="/tracking" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-search"></i>
              Track Document
            </NavLink>
            <NavLink to="/qr-scanner" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-qr-code-scan"></i>
              QR Scanner
            </NavLink>
            <NavLink to="/reports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-journal-text"></i>
              Monitoring Log
            </NavLink>
          </>
        )}

        {/* OPM Assistant */}
        {role === 'OPM Assistant' && (
          <>
            <div className="sidebar-section" style={{ marginTop: 16 }}>OPM Assistant</div>
            <NavLink to="/opm-assistant" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-person-check-fill"></i>
              Review Queue
            </NavLink>
            <NavLink to="/tracking" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-search"></i>
              Track Document
            </NavLink>
          </>
        )}

        {/* PM */}
        {role === 'PM' && (
          <>
            <div className="sidebar-section" style={{ marginTop: 16 }}>PM</div>
            <NavLink to="/pm-routing" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-inbox-fill"></i>
              PM Routing
            </NavLink>
            <NavLink to="/tracking" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-search"></i>
              Track Document
            </NavLink>
            <NavLink to="/reports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-journal-text"></i>
              Monitoring Log
            </NavLink>
          </>
        )}

        {/* DIVISION / SENDER */}
        {role === 'Division' && (
          <>
            <div className="sidebar-section" style={{ marginTop: 16 }}>My Division</div>
            <NavLink to="/division-documents" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-inbox-fill"></i>
              Routed Documents
            </NavLink>
            <NavLink to="/tracking" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-search"></i>
              Track Document
            </NavLink>
          </>
        )}

        {/* ADMIN */}
        {role === 'Admin' && (
          <>
            <div className="sidebar-section" style={{ marginTop: 16 }}>Admin</div>
            <NavLink to="/admin/users" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-people-fill"></i>
              User Management
            </NavLink>
            <NavLink to="/reports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-journal-text"></i>
              Monitoring Log
            </NavLink>
            <NavLink to="/tracking" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-search"></i>
              Track Document
            </NavLink>
          </>
        )}
      </nav>

      <div style={{ padding: '16px 20px', fontSize: 13, color: '#65676b', textAlign: 'center' }}>
        PPA - Records Process Flow v2.0
      </div>
    </aside>
  )
}
