import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Row, Col, Form, Button } from 'react-bootstrap'
import StatusBadge from '../components/StatusBadge'
import { DOCUMENT_TYPES } from '../data/mockData'
import { useDocuments } from '../context/DocumentContext'
import { WORKFLOW_STATUS, getStatusDisplayLabel } from '../utils/workflowLabels'

const INCOMING_FILTERS_STORAGE_KEY = 'incoming-communications-filters-v1'

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
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return year && month && day ? `${year}-${month}-${day}` : ''
}

export default function IncomingCommunications() {
  const { documents } = useDocuments()
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')
  const todayKey = useMemo(() => formatDateInManila(new Date()), [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(INCOMING_FILTERS_STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return

      setStatusFilter(typeof parsed.statusFilter === 'string' ? parsed.statusFilter : '')
      setTypeFilter(typeof parsed.typeFilter === 'string' ? parsed.typeFilter : '')
      setSearchTerm(typeof parsed.searchTerm === 'string' ? parsed.searchTerm : '')
      setQuickFilter(typeof parsed.quickFilter === 'string' ? parsed.quickFilter : 'all')
    } catch {
      // Ignore broken saved filter payload.
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(
        INCOMING_FILTERS_STORAGE_KEY,
        JSON.stringify({ statusFilter, typeFilter, searchTerm, quickFilter })
      )
    } catch {
      // localStorage may be unavailable (private mode/restricted browser).
    }
  }, [statusFilter, typeFilter, searchTerm, quickFilter])

  const getDocumentDateKey = (doc) => {
    const dateReceivedRaw = String(doc?.dateReceived || '').trim()
    if (dateReceivedRaw) return dateReceivedRaw.slice(0, 10)

    const stampedDateRaw = String(doc?.stampedDate || '').trim()
    if (stampedDateRaw) return stampedDateRaw.slice(0, 10)

    return ''
  }

  const matchesQuickFilter = (doc, preset = quickFilter) => {
    const docDateKey = getDocumentDateKey(doc)

    if (preset === 'today') {
      return docDateKey === todayKey
    }

    if (preset === 'needs-endorsement') {
      return doc.status === WORKFLOW_STATUS.REGISTERED
    }

    if (preset === 'overdue') {
      return doc.status === WORKFLOW_STATUS.REGISTERED && docDateKey && docDateKey < todayKey
    }

    return true
  }

  const filtered = documents.filter(doc => {
    if (!matchesQuickFilter(doc)) return false
    if (statusFilter && doc.status !== statusFilter) return false
    if (typeFilter && doc.type !== typeFilter) return false
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      return (
        doc.trackingNumber.toLowerCase().includes(q) ||
        doc.subject.toLowerCase().includes(q) ||
        doc.sender.toLowerCase().includes(q)
      )
    }
    return true
  })

  const countByStatus = (status) => documents.filter(d => d.status === status).length
  const countByQuickFilter = (preset) => documents.filter((doc) => matchesQuickFilter(doc, preset)).length

  const quickFilterOptions = [
    { key: 'all', label: 'All Queue', icon: 'bi-grid-3x3-gap', color: '#6c757d' },
    { key: 'today', label: 'Today', icon: 'bi-calendar-event', color: '#0d6efd' },
    { key: 'needs-endorsement', label: 'Needs Endorsement', icon: 'bi-send-check', color: '#fd7e14' },
    { key: 'overdue', label: 'Overdue', icon: 'bi-exclamation-triangle-fill', color: '#dc3545' },
  ]

  const formatTimeTo12Hour = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return ''

    if (/\b(am|pm)\b/i.test(raw)) {
      return raw.replace(/\s+/g, ' ').toUpperCase()
    }

    const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    if (!match) return raw

    const hour24 = Number(match[1])
    const minute = match[2]
    if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23) return raw

    const suffix = hour24 >= 12 ? 'PM' : 'AM'
    const hour12 = hour24 % 12 || 12
    return `${String(hour12).padStart(2, '0')}:${minute} ${suffix}`
  }

  return (
    <div className="incoming-page">
      <div className="page-header incoming-header d-flex justify-content-between align-items-start">
        <div>
          <h4>Incoming Communications</h4>
        </div>
        <Link to="/scan" className="btn btn-primary">
          <i className="bi bi-plus-lg me-1"></i> New Document
        </Link>
      </div>

      {/* Proposed Flow Steps Overview */}
      <div className="content-card mb-3 incoming-flow-card">
        <div className="content-card-body py-3">
          <div className="incoming-flow-steps d-flex justify-content-between align-items-center flex-wrap gap-2" style={{ fontSize: 11 }}>
            {[
              { status: WORKFLOW_STATUS.REGISTERED, label: getStatusDisplayLabel(WORKFLOW_STATUS.REGISTERED), count: countByStatus(WORKFLOW_STATUS.REGISTERED), icon: 'bi-inbox-fill', color: '#0d6efd' },
              { status: WORKFLOW_STATUS.OPM_INITIAL_REVIEW, label: getStatusDisplayLabel(WORKFLOW_STATUS.OPM_INITIAL_REVIEW), count: countByStatus(WORKFLOW_STATUS.OPM_INITIAL_REVIEW), icon: 'bi-send-fill', color: '#6f42c1' },
              { status: WORKFLOW_STATUS.PM_REVIEW, label: getStatusDisplayLabel(WORKFLOW_STATUS.PM_REVIEW), count: countByStatus(WORKFLOW_STATUS.PM_REVIEW), icon: 'bi-person-check-fill', color: '#6f42c1' },
              { status: WORKFLOW_STATUS.ROUTED_CONCERNED, label: getStatusDisplayLabel(WORKFLOW_STATUS.ROUTED_CONCERNED), count: countByStatus(WORKFLOW_STATUS.ROUTED_CONCERNED), icon: 'bi-diagram-3-fill', color: '#fd7e14' },
              { status: WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED, label: getStatusDisplayLabel(WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED), count: countByStatus(WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED), icon: 'bi-check-circle-fill', color: '#198754' },
            ].map((s, i, arr) => (
              <div key={i} className="d-flex align-items-center" style={{ flex: i < arr.length - 1 ? 1 : 'none' }}>
                <div className="incoming-flow-step d-flex align-items-center gap-2 cursor-pointer" onClick={() => { setStatusFilter(s.status); setQuickFilter('all') }} style={{ cursor: 'pointer' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: statusFilter === s.status ? s.color : '#f0f0f0',
                    color: statusFilter === s.status ? '#fff' : s.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, flexShrink: 0,
                  }}>
                    {s.count}
                  </div>
                  <span style={{ fontWeight: statusFilter === s.status ? 600 : 400, color: statusFilter === s.status ? s.color : '#6c757d', whiteSpace: 'nowrap' }}>
                    {s.label}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ flex: 1, minWidth: 24, height: 2, background: '#e9ecef', margin: '0 8px' }}></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="content-card incoming-list-card">
        {/* Filters */}
        <div className="content-card-body py-3 incoming-filter-panel">
          <div className="incoming-quick-filters d-flex flex-wrap align-items-center gap-2 mb-3">
            <span style={{ fontSize: 12, fontWeight: 600, color: '#495057' }}>Priority Queue:</span>
            {quickFilterOptions.map((preset) => {
              const active = quickFilter === preset.key
              return (
                <Button
                  key={preset.key}
                  size="sm"
                  variant={active ? 'secondary' : 'outline-secondary'}
                  onClick={() => setQuickFilter(preset.key)}
                  style={active
                    ? { background: preset.color, borderColor: preset.color, color: '#fff' }
                    : { color: preset.color, borderColor: '#d0d7de' }}
                >
                  <i className={`bi ${preset.icon} me-1`}></i>
                  {preset.label}
                  <span
                    style={{
                      marginLeft: 8,
                      padding: '1px 6px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      background: active ? 'rgba(255,255,255,0.22)' : '#f1f3f5',
                      color: active ? '#fff' : '#495057',
                    }}
                  >
                    {countByQuickFilter(preset.key)}
                  </span>
                </Button>
              )
            })}
          </div>

          <Row className="g-2 align-items-end incoming-filter-grid">
            <Col md={4}>
              <Form.Control
                size="sm"
                placeholder="Search control/reference #, subject, sender..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </Col>
            <Col md={2}>
              <Form.Select size="sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value={WORKFLOW_STATUS.REGISTERED}>{getStatusDisplayLabel(WORKFLOW_STATUS.REGISTERED)}</option>
                <option value={WORKFLOW_STATUS.OPM_INITIAL_REVIEW}>{getStatusDisplayLabel(WORKFLOW_STATUS.OPM_INITIAL_REVIEW)}</option>
                <option value={WORKFLOW_STATUS.PM_REVIEW}>{getStatusDisplayLabel(WORKFLOW_STATUS.PM_REVIEW)}</option>
                <option value={WORKFLOW_STATUS.ROUTED_CONCERNED}>{getStatusDisplayLabel(WORKFLOW_STATUS.ROUTED_CONCERNED)}</option>
                <option value={WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED}>{getStatusDisplayLabel(WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED)}</option>
              </Form.Select>
            </Col>
            <Col md={2}>
              <Form.Select size="sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="">All Types</option>
                {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Form.Select>
            </Col>
            <Col md={2}>
              <Button size="sm" variant="outline-secondary" onClick={() => { setStatusFilter(''); setTypeFilter(''); setSearchTerm(''); setQuickFilter('all') }}>
                <i className="bi bi-x-lg me-1"></i>Clear
              </Button>
            </Col>
          </Row>
        </div>

        {/* Documents Table */}
        <div className="table-responsive incoming-table-wrap">
          <table className="table doc-table incoming-communications-table incoming-table mb-0">
            <thead>
              <tr>
                <th style={{ width: 148 }}>Control/Reference #</th>
                <th style={{ width: 178 }}>Subject</th>
                <th style={{ width: 96 }}>Type</th>
                <th style={{ width: 130 }}>Sender</th>
                <th style={{ width: 112 }}>Address</th>
                <th style={{ width: 196 }}>Status</th>
                <th style={{ width: 108 }}>Date / Time</th>
                <th style={{ width: 138 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-muted">
                    <i className="bi bi-inbox" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.3 }}></i>
                    {documents.length === 0
                      ? <span>No documents yet. <Link to="/scan">Scan & Register</Link> a new incoming document.</span>
                      : 'No documents match filters'
                    }
                  </td>
                </tr>
              ) : (
                filtered.map(doc => (
                  <tr key={doc.id} className="incoming-row">
                    <td style={{ width: 148, minWidth: 148 }}>
                      <Link to={`/document/${doc.id}`} className="tracking-number text-decoration-none">
                        {doc.trackingNumber}
                      </Link>
                    </td>
                    <td style={{ maxWidth: 178, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.subject}>
                      {doc.subject}
                    </td>
                    <td><span className="badge bg-light text-dark border" style={{ fontSize: 11 }}>{doc.type}</span></td>
                    <td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.sender}>
                      {doc.sender}
                    </td>
                    <td style={{ maxWidth: 112, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={doc.senderAddress}>{doc.senderAddress}</td>
                    <td style={{ width: 196, minWidth: 196, maxWidth: 196 }}><StatusBadge status={doc.status} compact /></td>
                    <td style={{ width: 108, minWidth: 108, whiteSpace: 'nowrap', fontSize: 12 }}>
                      {doc.dateReceived}
                      {doc.timeReceived && <div style={{ fontSize: 10, color: '#6c757d' }}>{formatTimeTo12Hour(doc.timeReceived)}</div>}
                    </td>
                    <td style={{ width: 138, minWidth: 138, whiteSpace: 'nowrap', padding: '9px 6px' }}>
                      <div className="incoming-actions d-flex gap-2 flex-nowrap justify-content-center">
                        <Link to={`/document/${doc.id}`} className="action-btn" title="View Details">
                          <i className="bi bi-eye"></i>
                        </Link>
                        {doc.status === 'Registered' && (
                          <Link to={`/document/${doc.id}`} className="action-btn" title="Open document to endorse to OPM">
                            <i className="bi bi-send"></i>
                          </Link>
                        )}
                        <Link to={`/transmittal/${doc.id}`} className="action-btn" title="Transmittal Slip">
                          <i className="bi bi-printer"></i>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="content-card-body border-top d-flex justify-content-between align-items-center py-2 incoming-footer-meta">
            <span style={{ fontSize: 13, color: '#6c757d' }}>
              Showing {filtered.length} of {documents.length} communications
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
