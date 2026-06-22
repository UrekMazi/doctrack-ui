import { Link } from 'react-router-dom'
import { Row, Col } from 'react-bootstrap'
import StatusBadge from '../components/StatusBadge'
import RecordsDashboard from '../components/RecordsDashboard'
import { useDocuments } from '../context/DocumentContext'
import { WORKFLOW_STATUS, OPM_ROLE_DISPLAY, getStatusDisplayLabel, isOpmInitialReviewStatus, isOpmRole, normalizeRole } from '../utils/workflowLabels'

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
  const role = normalizeRole(currentUser?.systemRole || currentUser?.role || 'Operator')
  const isOpm = isOpmRole(role)
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

  const isRoutedStatus = (status) => (
    status === WORKFLOW_STATUS.ROUTED_CONCERNED ||
    status === WORKFLOW_STATUS.REROUTED ||
    status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION
  )

  const getKanbanCount = (statusKey) => (
    statusKey === WORKFLOW_STATUS.ROUTED_CONCERNED
      ? dailyDocuments.filter(d => isRoutedStatus(d.status)).length
      : statusKey === WORKFLOW_STATUS.OPM_INITIAL_REVIEW
        ? dailyDocuments.filter(d => isOpmInitialReviewStatus(d.status)).length
        : dailyDocuments.filter(d => d.status === statusKey).length
  )

  const operatorKanbanColumns = [
    { key: WORKFLOW_STATUS.REGISTERED, title: 'Records', subtitle: 'Registered', accent: '#0d6efd' },
    { key: WORKFLOW_STATUS.OPM_INITIAL_REVIEW, title: 'OPM', subtitle: 'Initial Review', accent: '#6f42c1' },
    { key: WORKFLOW_STATUS.PM_REVIEW, title: 'PM', subtitle: 'Under Review', accent: '#dc3545' },
    { key: WORKFLOW_STATUS.ROUTED_CONCERNED, title: 'RC/s Concerned', subtitle: 'For Acknowledge', accent: '#fd7e14' },
    { key: WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED, title: 'Completed', subtitle: 'Acknowledged', accent: '#198754' },
  ]

  const kanbanByStatus = operatorKanbanColumns.reduce((acc, col) => {
    acc[col.key] = dailyDocuments
      .filter(d => (
        col.key === WORKFLOW_STATUS.ROUTED_CONCERNED
          ? isRoutedStatus(d.status)
          : col.key === WORKFLOW_STATUS.OPM_INITIAL_REVIEW
            ? isOpmInitialReviewStatus(d.status)
            : d.status === col.key
      ))
      .slice(0, 6)
    return acc
  }, {})

  // Records dashboard: compute routed-to-division documents by OPM (secretary/assistant)
  const routedByOpm = documents.filter(d => (
    (d.status === WORKFLOW_STATUS.ROUTED_CONCERNED || d.status === WORKFLOW_STATUS.REROUTED || d.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION)
    && Array.isArray(d.routingHistory) && d.routingHistory.some(s => String(s.office || s.user || '').toLowerCase().includes('opm'))
  ))

  const now = Date.now()
  const summarizeRouted = (docs) => {
    let total = docs.length
    let completed = 0
    let wip = 0
    let overdue = 0
    let wipPrev = 0

    const rows = docs.map(d => {
      // find routing step where it moved to division
      const routeStep = (d.routingHistory || []).slice().reverse().find(s => /route|rout/i.test(String(s.action || '')) || /rout/i.test(String(s.office || '')))
      const routedAt = routeStep ? (toTimestampMs(routeStep.createdAt || routeStep.timestamp || routeStep.date || '') || toTimestampMs(d.registeredAt || d.createdAt || '')) : (toTimestampMs(d.registeredAt || d.createdAt || ''))
      const completedAt = d.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED ? (toTimestampMs(d.completedAt || d.dateCompleted || '')) : 0
      const dueDateTs = toTimestampMs(d.dueDate || d.targetDueDate || '')
      const isCompleted = d.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED
      const daysElapsed = isCompleted ? (completedAt ? Math.max(0, Math.floor((completedAt - routedAt) / 86400000)) : null) : Math.max(0, Math.floor((now - routedAt) / 86400000))
      const isOverdue = !isCompleted && dueDateTs && now > dueDateTs
      const overdueDays = isOverdue ? Math.max(0, Math.floor((now - dueDateTs) / 86400000)) : 0

      if (isCompleted) completed++
      else {
        wip++
        // wipPrev: routed before this month (not completed)
        const monthKey = new Date().toISOString().slice(0,7)
        const routedMonth = new Date(routedAt).toISOString().slice(0,7)
        if (routedMonth < monthKey) wipPrev++
      }
      if (isOverdue) overdue++

      return {
        id: d.id,
        trackingNumber: d.trackingNumber,
        division: d.targetDivision || (d.routingHistory && d.routingHistory.slice().reverse()[0]?.office) || d.senderAddress,
        status: d.status,
        dateRouted: routedAt ? new Date(routedAt).toISOString() : '',
        dateCompleted: completedAt ? new Date(completedAt).toISOString() : '',
        daysElapsed,
        dueDate: dueDateTs ? new Date(dueDateTs).toISOString() : null,
        isOverdue,
        overdueDays,
      }
    })

    return { total, completed, wip, wipPrev, overdue, rows }
  }

  const routedSummary = summarizeRouted(routedByOpm)

  // status overview by division
  const divisionKeys = Array.from(new Set(routedByOpm.map(d => d.targetDivision || d.senderAddress || 'Unknown')))
  const statusOverviewData = divisionKeys.map(div => {
    const group = routedByOpm.filter(d => (d.targetDivision || d.senderAddress || 'Unknown') === div)
    const wip = group.filter(g => g.status !== WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED).length
    const completed = group.filter(g => g.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED).length
    const overdue = group.filter(g => {
      const due = toTimestampMs(g.dueDate || g.targetDueDate || '')
      return due && Date.now() > due && g.status !== WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED
    }).length
    return { division: div, wip, completed, overdue }
  })

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
    d.status === WORKFLOW_STATUS.PM_REVIEW ||
    d.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION ||
    d.status === WORKFLOW_STATUS.ROUTED_CONCERNED ||
    d.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED ||
    d.status === WORKFLOW_STATUS.REROUTED
  ).slice(0, 5)
  const pendingForPM = dailyDocuments.filter(d => d.status === WORKFLOW_STATUS.PM_REVIEW).length

  // OPM Secretary queue
  const assistantDocs = documents.filter(d =>
    isOpmInitialReviewStatus(d.status) ||
    d.status === WORKFLOW_STATUS.PM_REVIEW ||
    d.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION ||
    d.status === WORKFLOW_STATUS.REROUTED
  ).slice(0, 5)
  const pendingAssistant = dailyDocuments.filter(d => isOpmInitialReviewStatus(d.status)).length
  const reviewedAssistant = dailyDocuments.filter(d => d.status === WORKFLOW_STATUS.PM_REVIEW).length

  // Division sees their docs
  const divDocs = documents.filter(d =>
    (isRoutedToDivision(d, currentUser?.division) || d.senderAddress === currentUser?.division) &&
    (d.status === WORKFLOW_STATUS.ROUTED_CONCERNED || d.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED || d.status === WORKFLOW_STATUS.REROUTED || d.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION)
  ).slice(0, 5)
  const pendingForDiv = dailyDocuments.filter(d =>
    (isRoutedToDivision(d, currentUser?.division) || d.senderAddress === currentUser?.division) &&
    (d.status === WORKFLOW_STATUS.ROUTED_CONCERNED || d.status === WORKFLOW_STATUS.REROUTED)
  ).length

  const roleLabels = {
    Operator: { title: 'Operator Dashboard', desc: 'Records Section — Scan, Register & Endorse documents' },
    'OPM Secretary': { title: `${OPM_ROLE_DISPLAY} Dashboard`, desc: 'Initial OPM review and verification before forwarding to PM.' },
    PM: { title: 'PM Dashboard', desc: 'Port Manager — Route endorsed documents to divisions' },
    Division: { title: 'Division Dashboard', desc: `${currentUser?.division || 'Division'} — Receive & acknowledge routed documents` },
  }

  return (
    <div className="dashboard-page">
      <div className="page-header dashboard-header">
        <h4>{roleLabels[role]?.title || 'Dashboard'}</h4>
        <p>{roleLabels[role]?.desc || 'Overview'}</p>
      </div>

      {/* OPERATOR Dashboard - Reworked Records view */}
      {role === 'Operator' && (
        <RecordsDashboard documents={documents} currentUser={currentUser} />
      )}

      {/* OPM Secretary Dashboard */}
      {isOpm && (
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
              <h6><i className="bi bi-person-check-fill me-2 text-primary"></i>OPM Secretary Review Queue</h6>
              <Link to="/opm-secretary" className="btn btn-sm btn-outline-primary">Open Queue</Link>
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
                    {dailyDocuments.filter(d =>
                      d.status === WORKFLOW_STATUS.ROUTED_CONCERNED ||
                      d.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED ||
                      d.status === WORKFLOW_STATUS.REROUTED ||
                      d.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION
                    ).length}
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
                      d.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED
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
