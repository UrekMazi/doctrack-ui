import { NavLink } from 'react-router-dom'
import { prefetchRoute } from '../utils/routePrefetch'

export default function Sidebar({ currentUser }) {
  const role = currentUser?.systemRole || 'Operator'
  const linkPrefetchProps = (path) => ({
    onMouseEnter: () => prefetchRoute(path),
    onFocus: () => prefetchRoute(path),
    onTouchStart: () => prefetchRoute(path),
  })

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
          <div className="sidebar-brand-subtitle" title="PMO-Negros Occidental/Bacolod/Banago">
            <span className="sidebar-brand-subtitle-main">PMO-Negros Occidental/Bacolod/Banago</span>
            <span className="sidebar-brand-subtitle-sub">Records Process Flow</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section">Main</div>
        <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/')}>
          <i className="bi bi-grid-1x2-fill"></i>
          Dashboard
        </NavLink>

        {/* OPERATOR (Records Section) */}
        {role === 'Operator' && (
          <>
            <div className="sidebar-section" style={{ marginTop: 16 }}>Operator</div>
            <NavLink to="/scan" className={({ isActive }) => `sidebar-link sidebar-link-priority ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/scan')}>
              <i className="bi bi-upc-scan"></i>
              Scan & Register
            </NavLink>
            <NavLink to="/incoming" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/incoming')}>
              <i className="bi bi-inbox-fill"></i>
              Incoming Communications
            </NavLink>
            <NavLink to="/outgoing" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/outgoing')}>
              <i className="bi bi-send-fill"></i>
              Outgoing
            </NavLink>
            <NavLink to="/tracking" className={({ isActive }) => `sidebar-link sidebar-link-priority ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/tracking')}>
              <i className="bi bi-search"></i>
              Track Document
            </NavLink>
            <NavLink to="/qr-scanner" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/qr-scanner')}>
              <i className="bi bi-qr-code-scan"></i>
              QR Scanner
            </NavLink>
            <NavLink to="/reports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/reports')}>
              <i className="bi bi-journal-text"></i>
              Monitoring Log
            </NavLink>
          </>
        )}

        {/* OPM Assistant */}
        {role === 'OPM Assistant' && (
          <>
            <div className="sidebar-section" style={{ marginTop: 16 }}>Office of the Port Manager</div>
            <NavLink to="/opm-assistant" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/opm-assistant')}>
              <i className="bi bi-person-check-fill"></i>
              OPM Review Queue
            </NavLink>
            <NavLink to="/tracking" className={({ isActive }) => `sidebar-link sidebar-link-priority ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/tracking')}>
              <i className="bi bi-search"></i>
              Track Document
            </NavLink>
          </>
        )}

        {/* PM */}
        {role === 'PM' && (
          <>
            <div className="sidebar-section" style={{ marginTop: 16 }}>PM</div>
            <NavLink to="/pm-routing" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/pm-routing')}>
              <i className="bi bi-inbox-fill"></i>
              PM Routing
            </NavLink>
            <NavLink to="/tracking" className={({ isActive }) => `sidebar-link sidebar-link-priority ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/tracking')}>
              <i className="bi bi-search"></i>
              Track Document
            </NavLink>
            <NavLink to="/reports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/reports')}>
              <i className="bi bi-journal-text"></i>
              Monitoring Log
            </NavLink>
          </>
        )}

        {/* DIVISION / SENDER */}
        {role === 'Division' && (
          <>
            <div className="sidebar-section" style={{ marginTop: 16 }}>My Division</div>
            <NavLink to="/division-documents" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/division-documents')}>
              <i className="bi bi-inbox-fill"></i>
              Routed Documents
            </NavLink>
            <NavLink to="/tracking" className={({ isActive }) => `sidebar-link sidebar-link-priority ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/tracking')}>
              <i className="bi bi-search"></i>
              Track Document
            </NavLink>
          </>
        )}

        {/* ADMIN */}
        {role === 'Admin' && (
          <>
            <div className="sidebar-section" style={{ marginTop: 16 }}>Admin</div>
            <NavLink to="/admin/users" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/admin/users')}>
              <i className="bi bi-people-fill"></i>
              User Management
            </NavLink>
            <NavLink to="/reports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/reports')}>
              <i className="bi bi-journal-text"></i>
              Monitoring Log
            </NavLink>
            <NavLink to="/tracking" className={({ isActive }) => `sidebar-link sidebar-link-priority ${isActive ? 'active' : ''}`} {...linkPrefetchProps('/tracking')}>
              <i className="bi bi-search"></i>
              Track Document
            </NavLink>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-footer-pill">Workflow Live</span>
        <span className="sidebar-footer-text">PPA-PMO-NOB Records Flow</span>
      </div>
    </aside>
  )
}
