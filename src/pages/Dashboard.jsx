import { Link } from 'react-router-dom'
import { Row, Col } from 'react-bootstrap'
import StatusBadge from '../components/StatusBadge'
import {
  OUTGOING_DOCUMENTS,
  RECENT_ACTIVITY,
} from '../data/mockData'
import { useDocuments } from '../context/DocumentContext'

const formatDateInManila = (dateInput) => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
  if (Number.isNaN(date.getTime())) return ''

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)
  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  return year && month && day ? `${year}-${month}-${day}` : ''
}

const getOperationalDate = (doc) => {
  if (typeof doc?.createdAt === 'string' && doc.createdAt.trim()) {
    return formatDateInManila(doc.createdAt)
  }
  if (typeof doc?.dateReceived === 'string' && doc.dateReceived.trim()) {
    return doc.dateReceived.slice(0, 10)
  }
  return ''
}

const getRegisteredDate = (doc) => {
  if (typeof doc?.registeredAt === 'string' && doc.registeredAt.trim()) {
    return formatDateInManila(doc.registeredAt)
  }
  if (typeof doc?.stampedDate === 'string' && doc.stampedDate.trim()) {
    return doc.stampedDate.slice(0, 10)
  }
  return ''
}

export default function Dashboard({ currentUser }) {
  const { documents } = useDocuments()
  const role = currentUser?.systemRole || 'Operator'
  const todayKey = formatDateInManila(new Date())
  const dailyDocuments = documents.filter(doc => getOperationalDate(doc) === todayKey)
  const todaysRegisteredDocuments = documents.filter(doc => getRegisteredDate(doc) === todayKey)
  const todaysReceivedAndEndorsed = todaysRegisteredDocuments.filter(doc => doc.status !== 'Registered')
  const slaMetCount = todaysReceivedAndEndorsed.filter(doc => doc.slaMet === true).length
  const totalProcessingMins = todaysReceivedAndEndorsed.reduce((sum, doc) => sum + (Number(doc.processingTimeMinutes) || 0), 0)
  const avgProcessingTime = todaysReceivedAndEndorsed.length > 0 
    ? (totalProcessingMins / todaysReceivedAndEndorsed.length).toFixed(1)
    : 0
  const slaHitRate = todaysReceivedAndEndorsed.length > 0
    ? Math.round((slaMetCount / todaysReceivedAndEndorsed.length) * 100)
    : 0
  
  const pastIncompleteDocuments = documents.filter(doc => 
    doc.status === 'Registered' && 
    getRegisteredDate(doc) !== '' && 
    getRegisteredDate(doc) < todayKey
  )

  const isRoutedToDivision = (doc, division) => {
    const explicitTargets = Array.isArray(doc.targetDivisions) ? doc.targetDivisions : []
    return doc.targetDivision === division || explicitTargets.includes(division)
  }

  const operatorKanbanColumns = [
    { key: 'Registered', title: 'Records', subtitle: 'Registered', accent: '#0d6efd' },
    { key: 'For OPM Assistant Review', title: 'OPM Assistant', subtitle: 'For Review', accent: '#6f42c1' },
    { key: 'Endorsed to OPM', title: 'PM', subtitle: 'For Routing', accent: '#dc3545' },
    { key: 'Routed to Division', title: 'Division', subtitle: 'For Acknowledge', accent: '#fd7e14' },
    { key: 'Received & Acknowledged', title: 'Completed', subtitle: 'Acknowledged', accent: '#198754' },
  ]

  const kanbanByStatus = operatorKanbanColumns.reduce((acc, col) => {
    acc[col.key] = dailyDocuments
      .filter(d => d.status === col.key)
      .slice(0, 6)
    return acc
  }, {})

  // Operator sees all documents
  const recentIncoming = documents.slice(0, 5)
  const recentOutgoing = OUTGOING_DOCUMENTS.slice(0, 3)

  // PM sees endorsed docs
  const endorsedDocs = documents.filter(d =>
    d.status === 'Endorsed to OPM' || d.status === 'Routed to Division' || d.status === 'Received & Acknowledged'
  ).slice(0, 5)
  const pendingForPM = dailyDocuments.filter(d => d.status === 'Endorsed to OPM').length

  // OPM Assistant queue
  const assistantDocs = documents.filter(d =>
    d.status === 'For OPM Assistant Review' || d.status === 'Endorsed to OPM'
  ).slice(0, 5)
  const pendingAssistant = dailyDocuments.filter(d => d.status === 'For OPM Assistant Review').length
  const reviewedAssistant = dailyDocuments.filter(d => d.status === 'Endorsed to OPM').length

  // Division sees their docs
  const divDocs = documents.filter(d =>
    (isRoutedToDivision(d, currentUser?.division) || d.senderAddress === currentUser?.division) &&
    (d.status === 'Routed to Division' || d.status === 'Received & Acknowledged')
  ).slice(0, 5)
  const pendingForDiv = dailyDocuments.filter(d =>
    (isRoutedToDivision(d, currentUser?.division) || d.senderAddress === currentUser?.division) &&
    d.status === 'Routed to Division'
  ).length

  const roleLabels = {
    Operator: { title: 'Operator Dashboard', desc: 'Records Section — Scan, Register & Endorse documents' },
    'OPM Assistant': { title: 'OPM Assistant Dashboard', desc: 'Verify files/transmittal/record before forwarding to PM' },
    PM: { title: 'PM Dashboard', desc: 'Port Manager — Route endorsed documents to divisions' },
    Division: { title: 'Division Dashboard', desc: `${currentUser?.division || 'Division'} — Receive & acknowledge routed documents` },
  }

  return (
    <>
      <div className="page-header">
        <h4>{roleLabels[role]?.title || 'Dashboard'}</h4>
        <p>{roleLabels[role]?.desc || 'Overview'}</p>
      </div>

      {/* OPERATOR Dashboard */}
      {role === 'Operator' && (
        <>
          <Row className="g-3 mb-3">
            <Col sm={3}>
              <div className="stat-card">
                <div className="text-center py-2">
                  <div style={{ fontSize: 26, fontWeight: 700, color: '#002868', lineHeight: 1 }}>
                    {todaysReceivedAndEndorsed.length} <span style={{ fontSize: 16, color: '#6c757d', fontWeight: 500 }}>/ {todaysRegisteredDocuments.length}</span>
                  </div>
                  <div className="stat-card-label mt-2">Endorsed / Received Today</div>
                </div>
              </div>
            </Col>
            <Col sm={3}>
              <div className="stat-card">
                <div className="text-center py-2">
                  <div style={{ fontSize: 26, fontWeight: 700, color: slaHitRate >= 80 ? '#198754' : (slaHitRate >= 50 ? '#fd7e14' : '#dc3545'), lineHeight: 1 }}>
                    {slaHitRate}%
                  </div>
                  <div className="stat-card-label mt-2">
                    15-Min SLA Hit Rate
                    <div style={{ fontSize: 10, color: '#65676b', marginTop: 2 }}>({slaMetCount} met SLA)</div>
                  </div>
                </div>
              </div>
            </Col>
            <Col sm={3}>
              <div className="stat-card">
                <div className="text-center py-2">
                  <div style={{ fontSize: 26, fontWeight: 700, color: avgProcessingTime <= 15 ? '#198754' : '#dc3545', lineHeight: 1 }}>
                    {avgProcessingTime} <span style={{ fontSize: 16, fontWeight: 500 }}>min</span>
                  </div>
                  <div className="stat-card-label mt-2">Avg. Processing Time</div>
                </div>
              </div>
            </Col>
            <Col sm={3}>
              <div className="stat-card" style={{ border: pastIncompleteDocuments.length > 0 ? '1px solid #dc3545' : 'none', background: pastIncompleteDocuments.length > 0 ? '#fff5f5' : '#fff' }}>
                <div className="text-center py-2">
                  <div style={{ fontSize: 26, fontWeight: 700, color: pastIncompleteDocuments.length > 0 ? '#dc3545' : '#6c757d', lineHeight: 1 }}>
                    {pastIncompleteDocuments.length}
                  </div>
                  <div className="stat-card-label mt-2" style={{ color: pastIncompleteDocuments.length > 0 ? '#dc3545' : '#6c757d' }}>
                    {pastIncompleteDocuments.length > 0 ? <><i className="bi bi-exclamation-triangle-fill me-1"></i>Overdue Unendorsed</> : 'No Overdue Backlog'}
                    <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>(Received before today)</div>
                  </div>
                </div>
              </div>
            </Col>
          </Row>

          <Row className="g-3">
            <Col lg={8}>
              <div className="content-card">
                <div className="content-card-header">
                  <h6><i className="bi bi-inbox me-2 text-primary"></i>Recent Incoming Communications</h6>
                  <Link to="/incoming" className="btn btn-sm btn-outline-primary">View All</Link>
                </div>
                <div className="table-responsive">
                  <table className="table doc-table mb-0">
                    <thead>
                      <tr>
                        <th>Control/Reference #</th>
                        <th>Subject</th>
                        <th>Sender</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentIncoming.map(doc => (
                        <tr key={doc.id}>
                          <td>
                            <Link to={`/document/${doc.id}`} className="tracking-number text-decoration-none">
                              {doc.trackingNumber}
                            </Link>
                          </td>
                          <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.subject}
                          </td>
                          <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.sender}
                          </td>
                          <td><StatusBadge status={doc.status} /></td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{doc.dateReceived}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Col>
            <Col lg={4}>
              <div className="content-card">
                <div className="content-card-header">
                  <h6><i className="bi bi-lightning-charge-fill me-2 text-warning"></i>Operator Quick Actions</h6>
                </div>
                <div className="content-card-body" style={{ fontSize: 13 }}>
                  <div className="d-grid gap-2 mb-3">
                    <Link to="/scan" className="btn btn-primary btn-sm text-start">
                      <i className="bi bi-upc-scan me-2"></i>Scan & Register New Document
                    </Link>
                    <Link to="/incoming" className="btn btn-outline-primary btn-sm text-start">
                      <i className="bi bi-inbox-fill me-2"></i>Open Incoming Queue
                    </Link>
                    <Link to="/tracking" className="btn btn-outline-secondary btn-sm text-start">
                      <i className="bi bi-search me-2"></i>Track Document Status
                    </Link>
                  </div>
                  <div style={{ borderTop: '1px solid #f1f3f5', paddingTop: 10 }}>
                    <div className="fw-semibold mb-2" style={{ fontSize: 12, color: '#495057' }}>Recent Activity</div>
                    {RECENT_ACTIVITY.slice(0, 4).map(item => (
                      <div key={item.id} className="d-flex justify-content-between align-items-center py-1" style={{ fontSize: 12 }}>
                        <span style={{ color: '#495057', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '68%' }} title={`${item.action} - ${item.doc}`}>
                          {item.action}
                        </span>
                        <span style={{ color: '#adb5bd' }}>{item.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Col>
          </Row>

          <div className="content-card mt-3">
            <div className="content-card-header">
              <h6><i className="bi bi-kanban-fill me-2 text-primary"></i>Document Flow Kanban</h6>
              <span style={{ fontSize: 12, color: '#6c757d' }}>Live status by process stage</span>
            </div>
            <div className="content-card-body">
              <Row className="g-2">
                {operatorKanbanColumns.map(col => (
                  <Col key={col.key} xl={2} lg={4} md={6}>
                    <div style={{
                      border: 'none',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      borderRadius: 16,
                      background: '#f0f2f5',
                      minHeight: 240,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        padding: '12px 14px',
                        background: '#ffffff',
                        borderTop: `4px solid ${col.accent}`,
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#212529' }}>{col.title}</div>
                        <div className="d-flex justify-content-between align-items-center">
                          <span style={{ fontSize: 11, color: '#6c757d' }}>{col.subtitle}</span>
                          <span className="badge" style={{ background: col.accent, color: '#fff', fontSize: 10 }}>
                            {dailyDocuments.filter(d => d.status === col.key).length}
                          </span>
                        </div>
                      </div>
                      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {kanbanByStatus[col.key].length === 0 ? (
                          <div style={{ fontSize: 11, color: '#adb5bd', textAlign: 'center', paddingTop: 20 }}>
                            No documents
                          </div>
                        ) : (
                          kanbanByStatus[col.key].map(doc => (
                            <Link
                              key={doc.id}
                              to={`/document/${doc.id}`}
                              className="text-decoration-none"
                              style={{
                                border: '1px solid #dee2e6',
                                borderRadius: 8,
                                background: '#fff',
                                padding: '7px 8px',
                                display: 'block',
                              }}
                            >
                              <div className="tracking-number" style={{ fontSize: 10.5, marginBottom: 2 }}>{doc.trackingNumber}</div>
                              <div style={{ fontSize: 11.5, color: '#212529', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.subject}>
                                {doc.subject}
                              </div>
                              <div style={{ fontSize: 10.5, color: '#6c757d', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {doc.currentLocation || doc.targetDivision || 'N/A'}
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            </div>
          </div>
        </>
      )}

      {/* OPM Assistant Dashboard */}
      {role === 'OPM Assistant' && (
        <>
          <Row className="g-3 mb-3">
            <Col sm={6}>
              <div className="content-card">
                <div className="content-card-body text-center py-3">
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#6f42c1' }}>
                    {pendingAssistant}
                  </div>
                  <div style={{ fontSize: 12, color: '#6c757d' }}>Pending Review</div>
                </div>
              </div>
            </Col>
            <Col sm={6}>
              <div className="content-card">
                <div className="content-card-body text-center py-3">
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#198754' }}>
                    {reviewedAssistant}
                  </div>
                  <div style={{ fontSize: 12, color: '#6c757d' }}>Forwarded to PM</div>
                </div>
              </div>
            </Col>
          </Row>

          <div className="content-card">
            <div className="content-card-header">
              <h6><i className="bi bi-person-check-fill me-2 text-primary"></i>Review Queue</h6>
              <Link to="/opm-assistant" className="btn btn-sm btn-outline-primary">Open Queue</Link>
            </div>
            <div className="table-responsive">
              <table className="table doc-table mb-0">
                <thead>
                  <tr>
                    <th>Control/Reference #</th>
                    <th>Subject</th>
                    <th>Sender</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {assistantDocs.map(doc => (
                    <tr key={doc.id}>
                      <td>
                        <Link to={`/document/${doc.id}`} className="tracking-number text-decoration-none">
                          {doc.trackingNumber}
                        </Link>
                      </td>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.subject}
                      </td>
                      <td>{doc.sender}</td>
                      <td><StatusBadge status={doc.status} /></td>
                      <td style={{ fontSize: 13 }}>{doc.dateReceived}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* PM Dashboard */}
      {role === 'PM' && (
        <>
          <Row className="g-3 mb-3">
            <Col sm={6}>
              <div className="content-card">
                <div className="content-card-body text-center py-3">
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#ce1126' }}>
                    {pendingForPM}
                  </div>
                  <div style={{ fontSize: 12, color: '#6c757d' }}>Pending Routing</div>
                </div>
              </div>
            </Col>
            <Col sm={6}>
              <div className="content-card">
                <div className="content-card-body text-center py-3">
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#198754' }}>
                    {dailyDocuments.filter(d => d.status === 'Routed to Division' || d.status === 'Received & Acknowledged').length}
                  </div>
                  <div style={{ fontSize: 12, color: '#6c757d' }}>Routed</div>
                </div>
              </div>
            </Col>
          </Row>

          <div className="content-card">
            <div className="content-card-header">
              <h6><i className="bi bi-inbox me-2 text-primary"></i>Endorsed Documents</h6>
              <Link to="/pm-routing" className="btn btn-sm btn-outline-primary">View All</Link>
            </div>
            <div className="table-responsive">
              <table className="table doc-table mb-0">
                <thead>
                  <tr>
                    <th>Control/Reference #</th>
                    <th>Subject</th>
                    <th>Sender</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {endorsedDocs.map(doc => (
                    <tr key={doc.id}>
                      <td>
                        <Link to={`/document/${doc.id}`} className="tracking-number text-decoration-none">
                          {doc.trackingNumber}
                        </Link>
                      </td>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.subject}
                      </td>
                      <td>{doc.sender}</td>
                      <td><StatusBadge status={doc.status} /></td>
                      <td style={{ fontSize: 13 }}>{doc.dateReceived}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* DIVISION Dashboard */}
      {role === 'Division' && (
        <>
          <Row className="g-3 mb-3">
            <Col sm={6}>
              <div className="content-card">
                <div className="content-card-body text-center py-3">
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#fcd116' }}>
                    {pendingForDiv}
                  </div>
                  <div style={{ fontSize: 12, color: '#6c757d' }}>Pending Acknowledgement</div>
                </div>
              </div>
            </Col>
            <Col sm={6}>
              <div className="content-card">
                <div className="content-card-body text-center py-3">
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#198754' }}>
                    {dailyDocuments.filter(d =>
                      (isRoutedToDivision(d, currentUser?.division) || d.senderAddress === currentUser?.division) &&
                      d.status === 'Received & Acknowledged'
                    ).length}
                  </div>
                  <div style={{ fontSize: 12, color: '#6c757d' }}>Acknowledged</div>
                </div>
              </div>
            </Col>
          </Row>

          <div className="content-card">
            <div className="content-card-header">
              <h6><i className="bi bi-inbox me-2 text-primary"></i>Documents for {currentUser?.division}</h6>
              <Link to="/division-documents" className="btn btn-sm btn-outline-primary">View All</Link>
            </div>
            <div className="table-responsive">
              <table className="table doc-table mb-0">
                <thead>
                  <tr>
                    <th>Control/Reference #</th>
                    <th>Subject</th>
                    <th>Sender</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {divDocs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-4 text-muted">
                        No documents routed to your division yet
                      </td>
                    </tr>
                  ) : (
                    divDocs.map(doc => (
                      <tr key={doc.id}>
                        <td>
                          <Link to={`/document/${doc.id}`} className="tracking-number text-decoration-none">
                            {doc.trackingNumber}
                          </Link>
                        </td>
                        <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.subject}
                        </td>
                        <td>{doc.sender}</td>
                        <td><StatusBadge status={doc.status} /></td>
                        <td style={{ fontSize: 13 }}>{doc.dateReceived}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
