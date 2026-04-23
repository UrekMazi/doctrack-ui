import { Link } from 'react-router-dom'
import { Row, Col } from 'react-bootstrap'
import StatusBadge from '../components/StatusBadge'
import { useDocuments } from '../context/DocumentContext'
import { WORKFLOW_STATUS, OPM_ROLE_DISPLAY, getStatusDisplayLabel } from '../utils/workflowLabels'

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

const toTimestampMs = (dateValue, timeValue = '') => {
  const dateText = String(dateValue || '').trim()
  const timeText = String(timeValue || '').trim()
  if (!dateText && !timeText) return 0

  const candidate = [dateText, timeText].filter(Boolean).join(' ')
  const parsed = new Date(candidate)
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime()

  if (dateText && /^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    const fallback = new Date(`${dateText}T00:00:00`)
    if (!Number.isNaN(fallback.getTime())) return fallback.getTime()
  }

  return 0
}

const formatElapsedAge = (timestampMs, nowMs = Date.now()) => {
  if (!timestampMs) return '--'

  const diffMinutes = Math.max(0, Math.floor((nowMs - timestampMs) / 60000))
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  return `${Math.floor(diffHours / 24)}d ago`
}

export default function Dashboard({ currentUser }) {
  const { documents } = useDocuments()
  const role = currentUser?.systemRole || 'Operator'
  const todayKey = formatDateInManila(new Date())
  const nowMs = Date.now()
  const dailyDocuments = documents.filter(doc => getOperationalDate(doc) === todayKey)
  const todaysRegisteredDocuments = documents.filter(doc => getRegisteredDate(doc) === todayKey)
  const todaysReceivedAndEndorsed = todaysRegisteredDocuments.filter(doc => doc.status !== 'Registered')
  
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
    { key: WORKFLOW_STATUS.REGISTERED, title: 'Records', subtitle: 'Registered', accent: '#0d6efd' },
    { key: WORKFLOW_STATUS.OPM_INITIAL_REVIEW, title: 'OPM', subtitle: 'Initial Review', accent: '#6f42c1' },
    { key: WORKFLOW_STATUS.PM_REVIEW, title: 'PM', subtitle: 'Under Review', accent: '#dc3545' },
    { key: WORKFLOW_STATUS.ROUTED_CONCERNED, title: 'RC/s Concerned', subtitle: 'For Acknowledge', accent: '#fd7e14' },
    { key: WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED, title: 'Completed', subtitle: 'Acknowledged', accent: '#198754' },
  ]

  const kanbanByStatus = operatorKanbanColumns.reduce((acc, col) => {
    acc[col.key] = dailyDocuments
      .filter(d => d.status === col.key)
      .slice(0, 6)
    return acc
  }, {})

  // Operator sees all documents
  const recentIncoming = documents.slice(0, 5)
  const operatorActivityFeed = documents
    .map((doc) => {
      const routingHistory = Array.isArray(doc.routingHistory) ? doc.routingHistory : []
      const latestStep = routingHistory[routingHistory.length - 1] || null
      const pendingEndorsement = doc.status === WORKFLOW_STATUS.REGISTERED
      const docDateKey = getRegisteredDate(doc) || getOperationalDate(doc)
      const overduePending = pendingEndorsement && docDateKey && docDateKey < todayKey

      const latestStepMs = latestStep
        ? (
            toTimestampMs(latestStep.createdAt || latestStep.timestamp || '') ||
            toTimestampMs(latestStep.date || '', latestStep.time || '')
          )
        : 0

      const fallbackMs =
        toTimestampMs(doc.updatedAt || doc.registeredAt || doc.createdAt || '') ||
        toTimestampMs(docDateKey, doc.timeReceived || doc.stampedTime || '')

      return {
        key: `${doc.id}-${latestStepMs || fallbackMs || 0}`,
        docId: doc.id,
        trackingNumber: doc.trackingNumber,
        actionText: pendingEndorsement ? 'Waiting for endorsement to OPM' : (latestStep?.action || 'Document updated'),
        actor: pendingEndorsement
          ? (doc.receivedBy || 'Records Section')
          : (latestStep?.user || latestStep?.office || 'System'),
        status: doc.status,
        pendingEndorsement,
        overduePending,
        timestampMs: latestStepMs || fallbackMs || 0,
      }
    })
    .sort((a, b) => {
      if (a.overduePending !== b.overduePending) return a.overduePending ? -1 : 1
      if (a.pendingEndorsement !== b.pendingEndorsement) return a.pendingEndorsement ? -1 : 1
      return b.timestampMs - a.timestampMs
    })
    .slice(0, 8)

  // PM sees endorsed docs
  const endorsedDocs = documents.filter(d =>
    d.status === WORKFLOW_STATUS.PM_REVIEW || d.status === WORKFLOW_STATUS.ROUTED_CONCERNED || d.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED
  ).slice(0, 5)
  const pendingForPM = dailyDocuments.filter(d => d.status === WORKFLOW_STATUS.PM_REVIEW).length

  // OPM Assistant queue
  const assistantDocs = documents.filter(d =>
    d.status === WORKFLOW_STATUS.OPM_INITIAL_REVIEW || d.status === WORKFLOW_STATUS.PM_REVIEW
  ).slice(0, 5)
  const pendingAssistant = dailyDocuments.filter(d => d.status === WORKFLOW_STATUS.OPM_INITIAL_REVIEW).length
  const reviewedAssistant = dailyDocuments.filter(d => d.status === WORKFLOW_STATUS.PM_REVIEW).length

  // Division sees their docs
  const divDocs = documents.filter(d =>
    (isRoutedToDivision(d, currentUser?.division) || d.senderAddress === currentUser?.division) &&
    (d.status === WORKFLOW_STATUS.ROUTED_CONCERNED || d.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED)
  ).slice(0, 5)
  const pendingForDiv = dailyDocuments.filter(d =>
    (isRoutedToDivision(d, currentUser?.division) || d.senderAddress === currentUser?.division) &&
    d.status === WORKFLOW_STATUS.ROUTED_CONCERNED
  ).length

  const roleLabels = {
    Operator: { title: 'Operator Dashboard', desc: 'Records Section — Scan, Register & Endorse documents' },
    'OPM Assistant': { title: `${OPM_ROLE_DISPLAY} Dashboard`, desc: 'Initial OPM review and verification before forwarding to PM.' },
    PM: { title: 'PM Dashboard', desc: 'Port Manager — Route endorsed documents to divisions' },
    Division: { title: 'Division Dashboard', desc: `${currentUser?.division || 'Division'} — Receive & acknowledge routed documents` },
  }

  return (
    <div className="dashboard-page">
      <div className="page-header dashboard-header">
        <h4>{roleLabels[role]?.title || 'Dashboard'}</h4>
        <p>{roleLabels[role]?.desc || 'Overview'}</p>
      </div>

      {/* OPERATOR Dashboard */}
      {role === 'Operator' && (
        <>
          <Row className="g-3 mb-3">
            <Col lg={12}>
              <div className="content-card h-100 dashboard-kanban-card">
                <div className="content-card-header dashboard-kanban-header">
                  <h6><i className="bi bi-kanban-fill me-2 text-primary"></i>Document Flow Kanban</h6>
                  <span style={{ fontSize: 12, color: '#6c757d' }}>Live status by process stage</span>
                </div>
                <div className="content-card-body dashboard-kanban-body">
                  <Row className="g-2 align-items-stretch dashboard-kanban-grid">
                    {operatorKanbanColumns.map(col => (
                      <Col key={col.key} xl={2} lg={4} md={6}>
                        <div className="dashboard-kanban-lane" style={{
                          border: 'none',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                          borderRadius: 16,
                          background: '#f0f2f5',
                          minHeight: 240,
                          display: 'flex',
                          flexDirection: 'column',
                          overflow: 'hidden'
                        }}>
                          <div className="dashboard-kanban-lane-head" style={{
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
                          <div className="dashboard-kanban-lane-body" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {kanbanByStatus[col.key].length === 0 ? (
                              <div style={{ fontSize: 11, color: '#adb5bd', textAlign: 'center', paddingTop: 20 }}>
                                No documents
                              </div>
                            ) : (
                              kanbanByStatus[col.key].map(doc => (
                                <Link
                                  key={doc.id}
                                  to={`/document/${doc.id}`}
                                  className="dashboard-kanban-item text-decoration-none"
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
                    <Col xl={2} lg={4} md={6}>
                      <div className="d-flex flex-column gap-2 h-100 dashboard-metric-stack" style={{ minHeight: 240 }}>
                        <div className="stat-card dashboard-metric-card" style={{ flex: 1, border: pastIncompleteDocuments.length > 0 ? '1px solid #dc3545' : 'none', background: pastIncompleteDocuments.length > 0 ? '#fff5f5' : '#fff' }}>
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
                        <div className="stat-card dashboard-metric-card" style={{ flex: 1 }}>
                          <div className="text-center py-2">
                            <div style={{ fontSize: 26, fontWeight: 700, color: '#002868', lineHeight: 1 }}>
                              {todaysReceivedAndEndorsed.length} <span style={{ fontSize: 16, color: '#6c757d', fontWeight: 500 }}>/ {todaysRegisteredDocuments.length}</span>
                            </div>
                            <div className="stat-card-label mt-2">Endorsed / Received Today</div>
                          </div>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </div>
              </div>
            </Col>
          </Row>

          <Row className="g-3">
            <Col lg={8}>
              <div className="content-card dashboard-recent-card">
                <div className="content-card-header">
                  <h6><i className="bi bi-inbox me-2 text-primary"></i>Recent Incoming Communications</h6>
                  <Link to="/incoming" className="btn btn-sm btn-outline-primary">View All</Link>
                </div>
                <div className="table-responsive">
                  <table className="table doc-table dashboard-recent-table mb-0">
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
              <div className="content-card dashboard-activity-card">
                <div className="content-card-header">
                  <h6><i className="bi bi-clock-history me-2 text-secondary"></i>Recent Activity</h6>
                </div>
                <div className="content-card-body dashboard-activity-body" style={{ fontSize: 13 }}>
                  {operatorActivityFeed.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#6c757d' }}>No recent activity yet.</div>
                  ) : (
                    operatorActivityFeed.map((item) => (
                      <Link key={item.key} to={`/document/${item.docId}`} className="dashboard-activity-link text-decoration-none d-block mb-2">
                        <div
                          className="dashboard-activity-item border rounded p-2"
                          style={{
                            background: item.overduePending ? '#fff5f5' : (item.pendingEndorsement ? '#fffaf0' : '#f8f9fa'),
                            borderColor: item.overduePending ? '#f5c2c7' : '#e9ecef',
                          }}
                        >
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="tracking-number" style={{ fontSize: 11 }}>{item.trackingNumber}</span>
                            <span style={{ fontSize: 11, color: item.overduePending ? '#dc3545' : '#6c757d', fontWeight: 600 }}>
                              {formatElapsedAge(item.timestampMs, nowMs)}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#212529',
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={item.actionText}
                          >
                            {item.actionText}
                          </div>
                          <div className="d-flex justify-content-between align-items-center mt-1">
                            <span
                              style={{
                                fontSize: 11,
                                color: '#6c757d',
                                maxWidth: '55%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={item.actor}
                            >
                              {item.actor}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: item.overduePending ? '#dc3545' : '#495057' }}>
                              {getStatusDisplayLabel(item.status)}
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </Col>
          </Row>

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
    </div>
  )
}
